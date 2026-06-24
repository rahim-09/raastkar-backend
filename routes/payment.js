const express = require('express');
const router  = express.Router();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_KEY   = process.env.ADMIN_KEY || 'raastkar_admin_2024';

// ── Notification emails ────────────────────────────────────────────────────
const NOTIFY_EMAILS = [
  'farid.premani@gmail.com',
  'invest@ignitethespark.org',
  'rahimaliajmal14@gmail.com',
];

// ── Email sender ───────────────────────────────────────────────────────────
async function sendEmail(subject, html) {
  try {
    const nodemailer  = require('nodemailer');
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER || '',
        pass: process.env.GMAIL_PASS || '',
      },
    });
    await transporter.sendMail({
      from:    `"RaastKar App" <${process.env.GMAIL_USER}>`,
      to:      NOTIFY_EMAILS.join(','),
      subject,
      html,
    });
    console.log('✅ Email sent:', subject);
  } catch (e) {
    console.error('Email error:', e.message);
    // Never block the main flow
  }
}

// ── Payment notification email ─────────────────────────────────────────────
async function sendPaymentNotification(payment) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto">
      <div style="background:#2E7D52;padding:20px 24px;border-radius:10px 10px 0 0">
        <h2 style="color:#fff;margin:0">💰 New Payment Submitted!</h2>
      </div>
      <div style="background:#f9f9f9;padding:20px 24px;border-radius:0 0 10px 10px;
                  border:1px solid #e0e0e0;border-top:none">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#666;width:130px">Plan</td>
              <td style="padding:6px 0;font-weight:700;color:#2E7D52">${payment.planName}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Credits</td>
              <td style="padding:6px 0;font-weight:600">${payment.credits} credits</td></tr>
          <tr><td style="padding:6px 0;color:#666">Amount</td>
              <td style="padding:6px 0;font-weight:700;color:#1565C0">$${payment.amountUSD} USD</td></tr>
          <tr><td style="padding:6px 0;color:#666">Method</td>
              <td style="padding:6px 0">${payment.method}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Transaction ID</td>
              <td style="padding:6px 0;font-family:monospace;background:#f0f0f0;
                         padding:4px 8px;border-radius:4px">${payment.transactionId}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Phone</td>
              <td style="padding:6px 0">${payment.phone || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#666">User ID</td>
              <td style="padding:6px 0;font-size:12px;color:#999">${payment.userId || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Submitted</td>
              <td style="padding:6px 0">${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })} PKT</td></tr>
          ${payment.couponCode ? `
          <tr><td style="padding:6px 0;color:#666">Coupon</td>
              <td style="padding:6px 0;color:#E65100">${payment.couponCode} (${payment.discountPercent}% off)</td></tr>` : ''}
        </table>
        ${payment.screenshot ? `
        <div style="margin-top:16px;padding:12px;background:#E8F5E9;border-radius:8px;
                    border:1px solid #A5D6A7">
          <p style="margin:0;color:#2E7D52;font-weight:600">📎 Payment Screenshot Attached</p>
          <p style="margin:4px 0 0;color:#666;font-size:12px">User uploaded a payment screenshot</p>
        </div>` : ''}
        <div style="margin-top:16px;padding:12px;background:#FFF3E0;border-radius:8px;
                    border:1px solid #FFCC80">
          <p style="margin:0;color:#E65100;font-weight:600">⚡ Action Required</p>
          <p style="margin:4px 0 0;color:#666;font-size:12px">
            Please verify this payment and approve/reject in the admin portal:<br>
            <a href="https://raastkar.com/admin/" style="color:#2E7D52">raastkar.com/admin</a>
          </p>
        </div>
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0">
        <p style="color:#aaa;font-size:11px;margin:0">
          RaastKar Smart Farming Pakistan · Patent #19/675,514
        </p>
      </div>
    </div>`;

  await sendEmail(`💰 New Payment: ${payment.planName} - ${payment.method} - $${payment.amountUSD}`, html);
}

// ── DB connection ──────────────────────────────────────────────────────────
let _db = null;
async function getDB() {
  if (_db) return _db;
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  _db = client.db('raastkar');
  return _db;
}

// ── Default plans ──────────────────────────────────────────────────────────
const PLANS = {
  individual: { name: 'Individual', credits: 30,  price: 1400,  days: 30 },
  midsize:    { name: 'Mid Size',   credits: 50,  price: 2800,  days: 30 },
  large:      { name: 'Large',      credits: 100, price: 5600,  days: 30 },
  mega:       { name: 'Mega',       credits: 200, price: 14000, days: 30 },
  starter:    { name: 'Individual', credits: 30,  price: 1400,  days: 30 },
  standard:   { name: 'Mid Size',   credits: 50,  price: 2800,  days: 30 },
  pro:        { name: 'Large',      credits: 100, price: 5600,  days: 30 },
};

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ══════════════════════════════════════════════════════════════════════════

// GET /api/payment/details/:planKey
router.get('/details/:planKey', (req, res) => {
  const plan = PLANS[req.params.planKey];
  if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });
  res.json({
    success: true,
    plan,
    easypaisa: { number: '03002678621', name: 'ACEM Pakistan' },
  });
});

// POST /api/payment/submit
router.post('/submit', async (req, res) => {
  const {
    userId, planKey, planName, billingCycle,
    method, transactionId, phone,
    amountUSD, credits,
    couponCode, discountPercent, dollarOff,
    screenshot,
  } = req.body;

  if (!transactionId) {
    return res.status(400).json({ success: false, error: 'Transaction ID required' });
  }

  try {
    const db  = await getDB();
    const col = db.collection('payments');

    // Check duplicate
    const existing = await col.findOne({ transactionId });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'This Transaction ID was already submitted',
      });
    }

    const plan = PLANS[planKey] || { name: planName || 'Unknown', credits: credits || 30, days: 30 };

    const payment = {
      id:              Date.now().toString(),
      userId:          userId          || '',
      planKey:         planKey         || '',
      planName:        planName        || plan.name,
      billingCycle:    billingCycle    || 'monthly',
      method:          method          || 'EasyPaisa',
      transactionId:   transactionId.trim(),
      phone:           phone           || '',
      amountUSD:       amountUSD       || 0,
      credits:         credits         || plan.credits || 30,
      couponCode:      couponCode      || '',
      discountPercent: discountPercent || 0,
      dollarOff:       dollarOff       || 0,
      screenshot:      screenshot      || '',
      status:          'pending',
      created_at:      new Date().toISOString(),
      submittedAt:     new Date().toISOString(),
    };

    await col.insertOne(payment);
    console.log('✅ Payment saved:', transactionId);

    // ── Send email notification to team ──────────────────────────────────
    sendPaymentNotification(payment);

    res.json({
      success:   true,
      message:   'Payment submitted! Credits will be added within 15-30 minutes after verification.',
      paymentId: payment.id,
    });
  } catch (e) {
    console.error('Payment submit error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/payment/status/:paymentId
router.get('/status/:paymentId', async (req, res) => {
  try {
    const db  = await getDB();
    const doc = await db.collection('payments').findOne({ id: req.params.paymentId });
    if (!doc) return res.status(404).json({ success: false, error: 'Payment not found' });
    res.json({
      success: true,
      status:  doc.status,
      message: doc.status === 'approved'
        ? 'Payment verified! Credits have been added.'
        : doc.status === 'rejected'
        ? 'Payment rejected. Contact support: 03002678621'
        : 'Payment under review. Please wait 15-30 minutes.',
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/payment/marketplace/notify
router.post('/marketplace/notify', async (req, res) => {
  try {
    const db = await getDB();
    await db.collection('marketplace_notifications').insertOne({
      ...req.body,
      created_at: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: true });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════════════════════════

// GET /api/payment/admin/pending
router.get('/admin/pending', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payments = await (await getDB()).collection('payments')
      .find({ status: 'pending' }).sort({ created_at: -1 }).toArray();
    res.json({ success: true, payments });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/payment/admin/all
router.get('/admin/all', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payments = await (await getDB()).collection('payments')
      .find({}).sort({ created_at: -1 }).limit(500).toArray();
    res.json({ success: true, payments, total: payments.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/payment/admin/approve/:paymentId
router.post('/admin/approve/:paymentId', async (req, res) => {
  if (req.body.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db      = await getDB();
    const col     = db.collection('payments');
    const payment = await col.findOne({ id: req.params.paymentId });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    await col.updateOne(
      { id: req.params.paymentId },
      { $set: {
        status:     'approved',
        verifiedAt: new Date().toISOString(),
        expiresAt:  expiry.toISOString(),
      }}
    );

    // Add credits to user
    if (payment.userId) {
      await db.collection('users').updateOne(
        { id: payment.userId },
        { $inc: { credits: payment.credits || 30 } }
      );
      console.log('✅ Credits added:', payment.userId, '+', payment.credits);
    }

    // Send approval email
    sendEmail(
      `✅ Payment Approved: ${payment.planName} - ${payment.method}`,
      `<div style="font-family:Arial;padding:20px">
        <h2 style="color:#2E7D52">✅ Payment Approved</h2>
        <p><strong>Plan:</strong> ${payment.planName}</p>
        <p><strong>Credits Added:</strong> ${payment.credits}</p>
        <p><strong>Transaction ID:</strong> ${payment.transactionId}</p>
        <p><strong>User ID:</strong> ${payment.userId}</p>
        <p><strong>Approved at:</strong> ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })} PKT</p>
      </div>`
    );

    res.json({ success: true, message: 'Payment approved & credits added!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/payment/admin/reject/:paymentId
router.post('/admin/reject/:paymentId', async (req, res) => {
  if (req.body.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db = await getDB();
    await db.collection('payments').updateOne(
      { id: req.params.paymentId },
      { $set: {
        status:       'rejected',
        rejectedAt:   new Date().toISOString(),
        rejectReason: req.body.reason || '',
      }}
    );
    res.json({ success: true, message: 'Payment rejected' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
