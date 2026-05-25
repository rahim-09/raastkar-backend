const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_KEY = 'raastkar_admin_2024';

let db = null;
async function getDB() {
  if (db) return db;
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db('raastkar');
  return db;
}

// ── Farmer submits farm registration ──
router.post('/register', async (req, res) => {
  try {
    const {
      farmName, description, address, farmSize,
      email, phone, whatsapp, cropsGrown,
      quantity, financialMethod, userId,
    } = req.body;

    if (!farmName || !email || !address) {
      return res.status(400).json({
        success: false,
        error: 'Farm name, email and address required',
      });
    }

    const database = await getDB();
    const farms = database.collection('farms');

    // Check if already submitted
    const existing = await farms.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.json({
        success: true,
        status: existing.status,
        message: existing.status === 'pending'
          ? 'Your farm registration is under review'
          : existing.status === 'approved'
            ? 'Your farm is already approved!'
            : 'Your registration was rejected. Please contact support.',
        farm: existing,
      });
    }

    const farm = {
      farmName,
      description: description || '',
      address,
      farmSize: farmSize || '',
      email: email.toLowerCase(),
      phone: phone || '',
      whatsapp: whatsapp || '',
      cropsGrown: cropsGrown || '',
      quantity: quantity || '',
      financialMethod: financialMethod || 'Cash',
      userId: userId || '',
      status: 'pending', // pending, approved, rejected
      submittedAt: new Date().toISOString(),
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: '',
      adminNote: '',
    };

    await farms.insertOne(farm);

    console.log('NEW FARM REGISTRATION:', farmName, email);

    res.json({
      success: true,
      status: 'pending',
      message: 'Farm registration submitted! Admin will review within 24 hours.',
      farm,
    });
  } catch (e) {
    console.error('Farm register error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Check farm status ──
router.get('/status', async (req, res) => {
  try {
    const { email, userId } = req.query;
    if (!email && !userId) {
      return res.status(400).json({
        success: false,
        error: 'Email or userId required',
      });
    }

    const database = await getDB();
    const farms = database.collection('farms');

    const query = email
      ? { email: email.toLowerCase() }
      : { userId };

    const farm = await farms.findOne(query);

    if (!farm) {
      return res.json({
        success: true,
        registered: false,
        status: 'not_registered',
      });
    }

    res.json({
      success: true,
      registered: true,
      status: farm.status,
      farm: {
        farmName: farm.farmName,
        address: farm.address,
        cropsGrown: farm.cropsGrown,
        status: farm.status,
        submittedAt: farm.submittedAt,
        approvedAt: farm.approvedAt,
        rejectionReason: farm.rejectionReason,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── ADMIN: Get all farms ──
router.get('/admin/all', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const database = await getDB();
    const farms = database.collection('farms');
    const { status } = req.query;

    const query = status && status !== 'all' ? { status } : {};
    const allFarms = await farms.find(query)
      .sort({ submittedAt: -1 })
      .toArray();

    res.json({
      success: true,
      total: allFarms.length,
      pending: allFarms.filter(f => f.status === 'pending').length,
      approved: allFarms.filter(f => f.status === 'approved').length,
      rejected: allFarms.filter(f => f.status === 'rejected').length,
      farms: allFarms,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── ADMIN: Approve farm ──
router.post('/admin/approve', async (req, res) => {
  const { key, email, adminNote } = req.body;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const database = await getDB();
    const farms = database.collection('farms');

    await farms.updateOne(
      { email: email.toLowerCase() },
      {
        $set: {
          status: 'approved',
          approvedAt: new Date().toISOString(),
          adminNote: adminNote || '',
        },
      }
    );

    res.json({
      success: true,
      message: `Farm approved for ${email}`,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── ADMIN: Reject farm ──
router.post('/admin/reject', async (req, res) => {
  const { key, email, reason } = req.body;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const database = await getDB();
    const farms = database.collection('farms');

    await farms.updateOne(
      { email: email.toLowerCase() },
      {
        $set: {
          status: 'rejected',
          rejectedAt: new Date().toISOString(),
          rejectionReason: reason || 'Does not meet requirements',
        },
      }
    );

    res.json({
      success: true,
      message: `Farm rejected for ${email}`,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;