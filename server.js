const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();

// ── CORS — must be FIRST before everything ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── DB ──
const ADMIN_KEY = process.env.ADMIN_KEY || 'raastkar_admin_2024';
let _db = null;
async function getDB() {
  if (_db) return _db;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  _db = client.db('raastkar');
  return _db;
}

// ── HEALTH ──
app.get('/', (req, res) => res.json({
  status: 'RaastKar Backend Running!',
  version: '1.0.7',
  timestamp: new Date().toISOString(),
}));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── LOAN ROUTES ──
app.post('/api/loan/submit', async (req, res) => {
  try {
    const db = await getDB();
    await db.collection('loan_applications').insertOne({
      ...req.body,
      status: 'pending',
      adminNote: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    res.json({ success: true, message: 'Loan application submitted!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/loan/admin/all', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db   = await getDB();
    const apps = await db.collection('loan_applications').find({}).sort({ created_at: -1 }).toArray();
    res.json({ success: true, applications: apps, total: apps.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/loan/admin/update-status', async (req, res) => {
  if (req.body.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db = await getDB();
    await db.collection('loan_applications').updateOne(
      { _id: new ObjectId(req.body.id) },
      { $set: { status: req.body.status, adminNote: req.body.note || '', updated_at: new Date().toISOString() } }
    );
    res.json({ success: true, message: 'Status updated!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/loan/admin/delete', async (req, res) => {
  if (req.body.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db = await getDB();
    await db.collection('loan_applications').deleteOne({ _id: new ObjectId(req.body.id) });
    res.json({ success: true, message: 'Deleted!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── OTHER ROUTES ──
try { app.use('/api/pricing',       require('./routes/pricing'));       console.log('✅ pricing');       } catch (e) { console.log('❌ pricing:', e.message); }
try { app.use('/api/auth',          require('./routes/auth'));           console.log('✅ auth');           } catch (e) { console.log('❌ auth:', e.message); }
try { app.use('/api/remote-config', require('./routes/remote_config')); console.log('✅ remote-config'); } catch (e) { console.log('❌ remote-config:', e.message); }
try { app.use('/api/crop',          require('./routes/crop'));           console.log('✅ crop');           } catch (e) { console.log('❌ crop:', e.message); }
try { app.use('/api/drcrop',        require('./routes/drcrop'));         console.log('✅ drcrop');         } catch (e) { console.log('❌ drcrop:', e.message); }
try { app.use('/api/weather',       require('./routes/weather'));        console.log('✅ weather');        } catch (e) { console.log('❌ weather:', e.message); }
try { app.use('/api/carbon',        require('./routes/carbon'));         console.log('✅ carbon');         } catch (e) { console.log('❌ carbon:', e.message); }
try { app.use('/api/payment',       require('./routes/payment'));        console.log('✅ payment');        } catch (e) { console.log('❌ payment:', e.message); }
try { app.use('/api/farm',          require('./routes/farm'));           console.log('✅ farm');           } catch (e) { console.log('❌ farm:', e.message); }
try { app.use('/api/coupon',        require('./routes/coupon'));         console.log('✅ coupon');         } catch (e) { console.log('❌ coupon:', e.message); }
try { app.use('/api/marketplace',   require('./routes/marketplace'));    console.log('✅ marketplace');    } catch (e) { console.log('❌ marketplace:', e.message); }
try {
  app.use('/api/stripe', require('./routes/Stripe'));
  console.log('✅ stripe');
} catch (e) {
  try { app.use('/api/stripe', require('./routes/stripe')); console.log('✅ stripe'); }
  catch (e2) { console.log('❌ stripe:', e2.message); }
}
try { app.use('/api/iot', require('./routes/iot')); console.log('✅ iot'); } catch (e) { console.log('❌ iot:', e.message); }

// ── MANDI ──
try {
  const mandi = require('./routes/mandi');
  app.use('/api/mandi', mandi.router || mandi);
  app.get('/api/mandi/cron', async (req, res) => {
    try {
      const count = mandi.runScraper ? await mandi.runScraper() : 0;
      res.json({ success: true, count });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  console.log('✅ mandi');
} catch (e) { console.log('❌ mandi:', e.message); }

// ── 404 ──
app.use((req, res) => res.status(404).json({ error: 'Route not found', path: req.path }));

// ── START ──
if (process.env.NODE_ENV !== 'production') {
  app.listen(process.env.PORT || 3000, () =>
    console.log('RaastKar Backend running on port', process.env.PORT || 3000));
}

module.exports = app;