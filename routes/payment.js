const express = require('express');
const router = express.Router();

// Store pending payments (in production use database)
let pendingPayments = [];
let verifiedPayments = [];

// Admin credentials - change these!
const ADMIN_KEY = 'raastkar_admin_2024';

// EasyPaisa account details
const EASYPAISA_NUMBER = '03332455229';
const EASYPAISA_NAME = 'RaastKar';

// Plan prices
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

// Get payment details for a plan
router.get('/details/:planKey', (req, res) => {
  const { planKey } = req.params;
  const plan = PLANS[planKey];
  
  if (!plan) {
    return res.status(404).json({ 
      success: false, 
      error: 'Plan not found' 
    });
  }

  res.json({
    success: true,
    plan: plan,
    easypaisa: {
      number: EASYPAISA_NUMBER,
      name: EASYPAISA_NAME,
      instructions: [
        `Open EasyPaisa app or dial *786#`,
        `Select "Send Money"`,
        `Enter number: ${EASYPAISA_NUMBER}`,
        `Enter amount: PKR ${plan.price}`,
        `In reference write: RAASTKAR`,
        `Complete payment`,
        `Take screenshot of confirmation`,
        `Enter transaction ID in app`,
      ]
    },
    jazzcash: {
      number: EASYPAISA_NUMBER,
      instructions: [
        `Open JazzCash app`,
        `Select "Send Money"`,
        `Enter number: ${EASYPAISA_NUMBER}`,
        `Enter amount: PKR ${plan.price}`,
        `Complete payment`,
        `Enter transaction ID in app`,
      ]
    },
    bank: {
      bankName: 'HBL',
      accountNumber: '1234567890',
      iban: 'PK36HABB0000001234567890',
      accountTitle: 'RaastKar Pvt Ltd',
      amount: plan.price,
    },
    usdt: {
      trc20: 'TXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      erc20: '0xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      amount_usd: (plan.price / 280).toFixed(2),
    }
  });
});

// Submit payment for verification
router.post('/submit', (req, res) => {
  const { 
    userId, 
    planKey, 
    method, 
    transactionId, 
    phone,
    amount 
  } = req.body;

  if (!userId || !planKey || !method || !transactionId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields' 
    });
  }

  const plan = PLANS[planKey];
  if (!plan) {
    return res.status(404).json({ 
      success: false, 
      error: 'Invalid plan' 
    });
  }

  // Check if transaction already submitted
  const existing = pendingPayments.find(
    p => p.transactionId === transactionId
  );
  if (existing) {
    return res.status(400).json({ 
      success: false, 
      error: 'Transaction ID already submitted' 
    });
  }

  const payment = {
    id: Date.now().toString(),
    userId,
    planKey,
    plan,
    method,
    transactionId,
    phone,
    amount,
    status: 'pending',
    submittedAt: new Date().toISOString(),
  };

  pendingPayments.push(payment);

  // Send WhatsApp notification to admin
  console.log(`NEW PAYMENT SUBMITTED:
    User: ${userId}
    Plan: ${plan.name}
    Method: ${method}
    Transaction ID: ${transactionId}
    Amount: PKR ${amount}
    Phone: ${phone}
  `);

  res.json({
    success: true,
    message: 'Payment submitted for verification',
    paymentId: payment.id,
    estimatedTime: '15-30 minutes',
  });
});

// Check payment status
router.get('/status/:paymentId', (req, res) => {
  const { paymentId } = req.params;
  
  const pending = pendingPayments.find(
    p => p.id === paymentId
  );
  const verified = verifiedPayments.find(
    p => p.id === paymentId
  );

  if (verified) {
    return res.json({
      success: true,
      status: 'approved',
      plan: verified.plan,
      message: 'Payment verified! Plan activated.',
    });
  }

  if (pending) {
    return res.json({
      success: true,
      status: pending.status,
      message: pending.status === 'pending' 
        ? 'Payment under review. Please wait 15-30 minutes.'
        : pending.status === 'rejected'
        ? 'Payment rejected. Please contact support.'
        : 'Processing...',
    });
  }

  res.status(404).json({ 
    success: false, 
    error: 'Payment not found' 
  });
});

// Check payment by user ID
router.get('/user/:userId', (req, res) => {
  const { userId } = req.params;
  
  const verified = verifiedPayments
    .filter(p => p.userId === userId)
    .sort((a, b) => 
      new Date(b.verifiedAt) - new Date(a.verifiedAt)
    );

  if (verified.length > 0) {
    const latest = verified[0];
    return res.json({
      success: true,
      hasActivePlan: true,
      plan: latest.plan,
      expiresAt: latest.expiresAt,
    });
  }

  res.json({
    success: true,
    hasActivePlan: false,
    plan: { name: 'Free Trial', credits: 30, days: 30 },
  });
});

// ADMIN - Get all pending payments
router.get('/admin/pending', (req, res) => {
  const { key } = req.query;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ 
      error: 'Unauthorized' 
    });
  }
  res.json({ 
    success: true, 
    payments: pendingPayments.filter(
      p => p.status === 'pending'
    )
  });
});

// ADMIN - Approve payment
router.post('/admin/approve/:paymentId', (req, res) => {
  const { key } = req.body;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ 
      error: 'Unauthorized' 
    });
  }

  const paymentIndex = pendingPayments.findIndex(
    p => p.id === req.params.paymentId
  );
  
  if (paymentIndex === -1) {
    return res.status(404).json({ 
      error: 'Payment not found' 
    });
  }

  const payment = pendingPayments[paymentIndex];
  payment.status = 'approved';
  payment.verifiedAt = new Date().toISOString();
  
  const expiryDate = new Date();
  expiryDate.setDate(
    expiryDate.getDate() + payment.plan.days
  );
  payment.expiresAt = expiryDate.toISOString();

  verifiedPayments.push(payment);
  pendingPayments.splice(paymentIndex, 1);

  res.json({ 
    success: true, 
    message: 'Payment approved',
    payment 
  });
});

// ADMIN - Reject payment
router.post('/admin/reject/:paymentId', (req, res) => {
  const { key, reason } = req.body;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ 
      error: 'Unauthorized' 
    });
  }

  const payment = pendingPayments.find(
    p => p.id === req.params.paymentId
  );
  
  if (!payment) {
    return res.status(404).json({ 
      error: 'Payment not found' 
    });
  }

  payment.status = 'rejected';
  payment.rejectedAt = new Date().toISOString();
  payment.rejectReason = reason;

  res.json({ 
    success: true, 
    message: 'Payment rejected' 
  });
});

module.exports = router;