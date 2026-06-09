const express  = require('express');
const router   = express.Router();
const { MongoClient, ObjectId } = require('mongodb');

const ADMIN_KEY = process.env.ADMIN_KEY || 'raastkar_admin_2024';
let _db = null;

async function getDB() {
  if (_db) return _db;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  _db = client.db('raastkar');
  return _db;
}

// ── POST /api/marketplace/notify ── receive listing from app
router.post('/notify', async (req, res) => {
  try {
    const db  = await getDB();
    const doc = {
      title:     req.body.title     || '',
      category:  req.body.category  || 'Other',
      price:     Number(req.body.price) || 0,
      unit:      req.body.unit      || 'per kg',
      stock:     Number(req.body.stock) || 0,
      location:  req.body.location  || '',
      phone:     req.body.phone     || '',
      seller:    req.body.seller    || '',
      emoji:     req.body.emoji     || '🌾',
      imageUrl:  req.body.imageUrl  || null,
      imageBase64: req.body.imageBase64 || null,
      userId:    req.body.userId    || '',
      status:    'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.collection('marketplace_listings').insertOne(doc);
    res.json({ success: true, message: 'Listing submitted!' });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── GET /api/marketplace/admin/all ── get all listings
router.get('/admin/all', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db   = await getDB();
    const query = {};
    if (req.query.category) query.category = req.query.category;
    if (req.query.status)   query.status   = req.query.status;
    const listings = await db.collection('marketplace_listings')
      .find(query).sort({ created_at: -1 }).toArray();
    res.json({ success: true, listings, total: listings.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/marketplace/admin/add ── add new listing from admin
router.post('/admin/add', async (req, res) => {
  if (req.body.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db  = await getDB();
    const doc = {
      title:      req.body.title     || '',
      urdu:       req.body.urdu      || '',
      category:   req.body.category  || 'Other',
      price:      Number(req.body.price) || 0,
      unit:       req.body.unit      || 'per kg',
      min_order:  Number(req.body.min_order) || 1,
      stock:      Number(req.body.stock) || 0,
      location:   req.body.location  || '',
      phone:      req.body.phone     || '03002678621',
      seller:     req.body.seller    || 'RaastKar',
      emoji:      req.body.emoji     || '🌾',
      imageUrl:   req.body.imageUrl  || null,
      status:     'approved',
      source:     'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const result = await db.collection('marketplace_listings').insertOne(doc);
    res.json({ success: true, message: 'Listing added!', id: result.insertedId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/marketplace/admin/update ── edit listing
router.post('/admin/update', async (req, res) => {
  if (req.body.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db = await getDB();
    await db.collection('marketplace_listings').updateOne(
      { _id: new ObjectId(req.body.id) },
      { $set: {
        title:     req.body.title,
        urdu:      req.body.urdu      || '',
        category:  req.body.category,
        price:     Number(req.body.price),
        unit:      req.body.unit,
        min_order: Number(req.body.min_order) || 1,
        stock:     Number(req.body.stock),
        location:  req.body.location,
        phone:     req.body.phone,
        seller:    req.body.seller,
        emoji:     req.body.emoji     || '🌾',
        imageUrl:  req.body.imageUrl  || null,
        updated_at: new Date().toISOString(),
      }}
    );
    res.json({ success: true, message: 'Updated!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/marketplace/admin/update-status ── approve/reject
router.post('/admin/update-status', async (req, res) => {
  if (req.body.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db = await getDB();
    await db.collection('marketplace_listings').updateOne(
      { _id: new ObjectId(req.body.id) },
      { $set: { status: req.body.status, updated_at: new Date().toISOString() } }
    );
    res.json({ success: true, message: 'Status updated!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/marketplace/admin/delete ── delete listing
router.post('/admin/delete', async (req, res) => {
  if (req.body.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db = await getDB();
    await db.collection('marketplace_listings').deleteOne({ _id: new ObjectId(req.body.id) });
    res.json({ success: true, message: 'Deleted!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/marketplace/listings ── public listings for app
router.get('/listings', async (req, res) => {
  try {
    const db = await getDB();
    const listings = await db.collection('marketplace_listings')
      .find({ status: 'approved' }).sort({ created_at: -1 }).toArray();
    res.json({ success: true, listings, total: listings.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;