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

// Validate coupon from app
router.post('/validate', async (req, res) => {
  try {
    const { code, userId } = req.body;
    if (!code) return res.status(400).json({
      success: false, error: 'Code required'
    });

    const database = await getDB();
    const coupons = database.collection('coupons');
    const used = database.collection('used_coupons');

    const coupon = await coupons.findOne({
      code: code.trim().toUpperCase(),
      active: true
    });

    if (!coupon) return res.json({
      success: false, error: 'Invalid coupon code'
    });

    // Check expiry
    if (coupon.expiresAt && new Date() > new Date(coupon.expiresAt)) {
      return res.json({
        success: false, error: 'Coupon has expired'
      });
    }

    // Check max uses
    if (coupon.usedCount >= coupon.maxUses) {
      return res.json({
        success: false, error: 'Coupon limit reached'
      });
    }

    // Check if user already used it
    if (userId) {
      const alreadyUsed = await used.findOne({
        couponCode: code.toUpperCase(),
        userId: userId
      });
      if (alreadyUsed) return res.json({
        success: false, error: 'You already used this coupon'
      });
    }

    res.json({
      success: true,
      discount: coupon.discountType === 'percent'
        ? coupon.discount : 0,
      dollarOff: coupon.discountType === 'dollar'
        ? coupon.discount : 0,
      discountType: coupon.discountType,
      dealName: coupon.dealName,
      code: coupon.code,
      message: '🎉 ' + coupon.dealName + ' applied!'
    });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Mark coupon as used
router.post('/use', async (req, res) => {
  try {
    const { code, userId } = req.body;
    const database = await getDB();
    const coupons = database.collection('coupons');
    const used = database.collection('used_coupons');

    await coupons.updateOne(
      { code: code.toUpperCase() },
      { $inc: { usedCount: 1 } }
    );

    if (userId) {
      await used.insertOne({
        couponCode: code.toUpperCase(),
        userId,
        usedAt: new Date().toISOString()
      });
    }

    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Admin - create coupon
router.post('/admin/create', async (req, res) => {
  const { key, dealName, code, discountType,
    discount, maxUses, days, newOnly, allCustomers } = req.body;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const database = await getDB();
    const coupons = database.collection('coupons');

    const existing = await coupons.findOne({
      code: code.toUpperCase()
    });
    if (existing) return res.status(400).json({
      success: false, error: 'Code already exists'
    });

    const coupon = {
      dealName, code: code.toUpperCase(),
      discountType, discount: parseFloat(discount),
      maxUses: parseInt(maxUses) || 100,
      usedCount: 0,
      newOnly: newOnly || false,
      allCustomers: allCustomers || false,
      active: true,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(
        Date.now() + (parseInt(days) || 90) * 86400000
      ).toISOString()
    };

    await coupons.insertOne(coupon);
    res.json({ success: true, coupon });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Admin - get all coupons
router.get('/admin/all', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const database = await getDB();
    const coupons = database.collection('coupons');
    const all = await coupons.find({})
      .sort({ createdAt: -1 }).toArray();
    res.json({ success: true, coupons: all });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Admin - toggle coupon
router.post('/admin/toggle', async (req, res) => {
  const { key, code } = req.body;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const database = await getDB();
    const coupons = database.collection('coupons');
    const coupon = await coupons.findOne({
      code: code.toUpperCase()
    });
    if (!coupon) return res.status(404).json({
      error: 'Coupon not found'
    });
    await coupons.updateOne(
      { code: code.toUpperCase() },
      { $set: { active: !coupon.active } }
    );
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Admin - delete coupon
router.delete('/admin/delete/:code', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const database = await getDB();
    const coupons = database.collection('coupons');
    await coupons.deleteOne({
      code: req.params.code.toUpperCase()
    });
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;