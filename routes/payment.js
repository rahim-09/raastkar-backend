const express = require('express');
const router = express.Router();

let pendingPayments = [];
let verifiedPayments = [];

const ADMIN_KEY = 'raastkar_admin_2024';
const EASYPAISA_NUMBER = '03332455229';

const PLANS = {
  basic_monthly: { name: 'Basic', credits: 100, price: 500, days: 30 },
  basic_yearly: { name: 'Basic', credits: 100, price: 4800, days: 365 },
  basic_lifetime: { name: 'Basic', credits: 100, price: 9999, days: 36500 },
  pro_monthly: { name: 'Pro', credits: 500, price: 1500, days: 30 },
  pro_yearly: { name: 'Pro', credits: 500, price: 14400, days: 365 },
  pro_lifetime: { name: 'Pro', credits: 500, price: 24999, days: 36500 },
  enterprise_monthly: { name: 'Enterprise', credits: 2000, price: 5000, days: 30 },
  enterprise_yearly: { name: 'Enterprise', credits: 2000, price: 48000, days: 365 },
  enterprise_lifetime: { name: 'Enterprise', credits: 2000, price: 79999, days: 36500 },
};

router.get('/details/:planKey', (req, res) => {
  const plan = PLANS[req.params.planKey];
  if (!plan) {
    return res.status(404).json({ success: false, error: 'Plan not found' });
  }
  res.json({
    success: true,
    plan,
    easypaisa: {
      number: EASYPAISA_NUMBER,
      name: 'RaastKar',
    }
  });
});

router.post('/submit', (req, res) => {
  const { userId, planKey, method, transactionId, phone, amount } = req.body;

  if (!userId || !planKey || !method || !transactionId) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const plan = PLANS[planKey];
  if (!plan) {
    return res.status(404).json({ success: false, error: 'Invalid plan' });
  }

  const existing = pendingPayments.find(p => p.transactionId === transactionId);
  if (existing) {
    return res.status(400).json({ success: false, error: 'Transaction ID already submitted' });
  }

  const payment = {
    id: Date.now().toString(),
    userId,
    planKey,
    plan,
    method,
    transactionId,
    phone: phone || '',
    amount,
    status: 'pending',
    submittedAt: new Date().toISOString(),
  };

  pendingPayments.push(payment);
  console.log('NEW PAYMENT:', JSON.stringify(payment));

  res.json({
    success: true,
    message: 'Payment submitted for verification',
    paymentId: payment.id,
    estimatedTime: '15-30 minutes',
  });
});

router.get('/status/:paymentId', (req, res) => {
  const { paymentId } = req.params;

  const verified = verifiedPayments.find(p => p.id === paymentId);
  if (verified) {
    return res.json({
      success: true,
      status: 'approved',
      plan: verified.plan,
      message: 'Payment verified! Plan activated.',
    });
  }

  const pending = pendingPayments.find(p => p.id === paymentId);
  if (pending) {
    return res.json({
      success: true,
      status: pending.status,
      message: pending.status === 'pending'
        ? 'Payment under review. Please wait 15-30 minutes.'
        : 'Payment rejected. Please contact support.',
    });
  }

  res.status(404).json({ success: false, error: 'Payment not found' });
});

router.get('/user/:userId', (req, res) => {
  const verified = verifiedPayments
    .filter(p => p.userId === req.params.userId)
    .sort((a, b) => new Date(b.verifiedAt) - new Date(a.verifiedAt));

  if (verified.length > 0) {
    return res.json({
      success: true,
      hasActivePlan: true,
      plan: verified[0].plan,
      expiresAt: verified[0].expiresAt,
    });
  }

  res.json({
    success: true,
    hasActivePlan: false,
    plan: { name: 'Free Trial', credits: 30, days: 30 },
  });
});

router.get('/admin/pending', (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({
    success: true,
    payments: pendingPayments.filter(p => p.status === 'pending')
  });
});

router.post('/admin/approve/:paymentId', (req, res) => {
  if (req.body.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const idx = pendingPayments.findIndex(p => p.id === req.params.paymentId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  const payment = pendingPayments[idx];
  payment.status = 'approved';
  payment.verifiedAt = new Date().toISOString();

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + payment.plan.days);
  payment.expiresAt = expiry.toISOString();

  verifiedPayments.push(payment);
  pendingPayments.splice(idx, 1);

  res.json({ success: true, message: 'Payment approved', payment });
});

router.post('/admin/reject/:paymentId', (req, res) => {
  if (req.body.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payment = pendingPayments.find(p => p.id === req.params.paymentId);
  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  payment.status = 'rejected';
  payment.rejectedAt = new Date().toISOString();
  payment.rejectReason = req.body.reason || '';

  res.json({ success: true, message: 'Payment rejected' });
});

module.exports = router;