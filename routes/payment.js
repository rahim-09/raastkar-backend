const express = require('express');
const router  = express.Router();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_KEY   = process.env.ADMIN_KEY || 'raastkar_admin_2024';

// ── DB connection ──────────────────────────────────────
let _db = null;
async function getDB() {
  if (_db) return _db;
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  _db = client.db('raastkar');
  return _db;
}

// ── Default plans (fallback) ───────────────────────────
const PLANS = {
  individual: { name: 'Individual', credits: 30,  price: 1400,  days: 30  },
  midsize:    { name: 'Mid Size',   credits: 50,  price: 2800,  days: 30  },
  large:      { name: 'Large',      credits: 100, price: 5600,  days: 30  },
  mega:       { name: 'Mega',       credits: 200, price: 14000, days: 30  },
  // Legacy keys
  starter:    { name: 'Individual', credits: 30,  price: 1400,  days: 30  },
  standard:   { name: 'Mid Size',   credits: 50,  price: 2800,  days: 30  },
  pro:        { name: 'Large',      credits: 100, price: 5600,  days: 30  },
};

// ══════════════════════════════════════════════════════
// PUBLIC ROUTES
// ══════════════════════════════════════════════════════

// GET /api/payment/details/:planKey
router.get('/details/:planKey', (req, res) => {
  const plan = PLANS[req.params.planKey];
  if (!plan) {
    return res.status(404).json({ success: false, error: 'Plan not found' });
  }
  res.json({
    success: true,
    plan,
    easypaisa: { number: '03002678621', name: 'ACEM Pakistan' },
  });
});

// POST /api/payment/submit — submit payment with optional screenshot
router.post('/submit', async (req, res) => {
  const {
    userId, planKey, planName, billingCycle,
    method, transactionId, phone,
    amountUSD, credits,
    couponCode, discountPercent, dollarOff,
    screenshot,   // base64 image string
  } = req.body;

  if (!transactionId) {
    return res.status(400).json({ success: false, error: 'Transaction ID required' });
  }

  try {
    const db = await getDB();
    const col = db.collection('payments');

    // Check duplicate transaction ID
    const existing = await col.findOne({ transactionId });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'This Transaction ID was already submitted',
      });
    }

    const plan = PLANS[planKey] || { name: planName || 'Unknown', credits: credits || 30, days: 30 };

    const payment = {
      id:            Date.now().toString(),
      userId:        userId || '',
      planKey:       planKey || '',
      planName:      planName || plan.name,
      billingCycle:  billingCycle || 'monthly',
      method:        method || 'EasyPaisa',
      transactionId: transactionId.trim(),
      phone:         phone || '',
      amountUSD:     amountUSD || 0,
      credits:       credits || plan.credits || 30,
      couponCode:    couponCode || '',
      discountPercent: discountPercent || 0,
      dollarOff:     dollarOff || 0,
      screenshot:    screenshot || '',   // ← saved to MongoDB
      status:        'pending',
      created_at:    new Date().toISOString(),
      submittedAt:   new Date().toISOString(),
    };

    await col.insertOne(payment);
    console.log('✅ Payment saved:', transactionId, '| Screenshot:', !!screenshot);

    res.json({
      success: true,
      message: 'Payment submitted! Credits will be added within 15-30 minutes after verification.',
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

// GET /api/payment/marketplace/notify (used by marketplace screen)
router.post('/marketplace/notify', async (req, res) => {
  try {
    const db = await getDB();
    await db.collection('marketplace_notifications').insertOne({
      ...req.body,
      created_at: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (e) {
    res.json({ success: true }); // don't fail silently
  }
});

// ══════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════

// GET /api/payment/admin/pending — pending payments
router.get('/admin/pending', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const db  = await getDB();
    const payments = await db.collection('payments')
      .find({ status: 'pending' })
      .sort({ created_at: -1 })
      .toArray();
    res.json({ success: true, payments });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/payment/admin/all — ALL payments with screenshots
router.get('/admin/all', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const db  = await getDB();
    const payments = await db.collection('payments')
      .find({})
      .sort({ created_at: -1 })
      .limit(500)
      .toArray();
    res.json({ success: true, payments, total: payments.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/payment/admin/approve/:paymentId
router.post('/admin/approve/:paymentId', async (req, res) => {
  if (req.body.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const db  = await getDB();
    const col = db.collection('payments');
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
      const users = db.collection('users');
      await users.updateOne(
        { id: payment.userId },
        { $inc: { credits: payment.credits || 30 } }
      );
      console.log('✅ Credits added to user:', payment.userId, '+', payment.credits);
    }

    res.json({ success: true, message: 'Payment approved & credits added!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/payment/admin/reject/:paymentId
router.post('/admin/reject/:paymentId', async (req, res) => {
  if (req.body.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
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