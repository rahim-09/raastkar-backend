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

// POST /api/loan/submit
router.post('/submit', async (req, res) => {
  try {
    const db  = await getDB();
    const doc = {
      ...req.body,
      status:     'pending',
      adminNote:  '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.collection('loan_applications').insertOne(doc);
    res.json({ success: true, message: 'Loan application submitted successfully!' });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/loan/admin/all
router.get('/admin/all', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db   = await getDB();
    const apps = await db.collection('loan_applications')
      .find({}).sort({ created_at: -1 }).toArray();
    res.json({ success: true, applications: apps, total: apps.length });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/loan/admin/update-status
router.post('/admin/update-status', async (req, res) => {
  const { key, id, status, note } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db = await getDB();
    await db.collection('loan_applications').updateOne(
      { _id: new ObjectId(id) },
      { $set: {
        status,
        adminNote:  note || '',
        updated_at: new Date().toISOString(),
      }}
    );
    res.json({ success: true, message: 'Status updated!' });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/loan/admin/delete
router.post('/admin/delete', async (req, res) => {
  const { key, id } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db = await getDB();
    await db.collection('loan_applications').deleteOne({ _id: new ObjectId(id) });
    res.json({ success: true, message: 'Application deleted!' });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;