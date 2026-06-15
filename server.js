const express = require('express');
const cors    = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const ADMIN_KEY = process.env.ADMIN_KEY || 'raastkar_admin_2024';
let _db = null;
async function getDB() {
  if (_db) return _db;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  _db = client.db('raastkar');
  return _db;
}

app.get('/',       (req, res) => res.json({ status: 'RaastKar Backend Running!', version: '1.0.5', timestamp: new Date().toISOString() }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── LOAN ROUTES (inline — no separate file needed) ──
app.post('/api/loan/submit', async (req, res) => {
  try {
    const db = await getDB();
    await db.collection('loan_applications').insertOne({
      ...req.body, status: 'pending', adminNote: '',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    res.json({ success: true, message: 'Loan application submitted!' });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/loan/admin/all', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db   = await getDB();
    const apps = await db.collection('loan_applications').find({}).sort({ created_at: -1 }).toArray();
    res.json({ success: true, applications: apps, total: apps.length });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
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
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/loan/admin/delete', async (req, res) => {
  if (req.body.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db = await getDB();
    await db.collection('loan_applications').deleteOne({ _id: new ObjectId(req.body.id) });
    res.json({ success: true, message: 'Deleted!' });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── OTHER ROUTES ──
try { app.use('/api/pricing',       require('./routes/pricing'));       console.log('✅ pricing');       } catch(e) { console.log('❌ pricing:', e.message); }
try { app.use('/api/auth',          require('./routes/auth'));           console.log('✅ auth');           } catch(e) { console.log('❌ auth:', e.message); }
try { app.use('/api/remote-config', require('./routes/remote_config')); console.log('✅ remote-config'); } catch(e) { console.log('❌ remote-config:', e.message); }
try { app.use('/api/crop',          require('./routes/crop'));           console.log('✅ crop');           } catch(e) { console.log('❌ crop:', e.message); }
try { app.use('/api/drcrop',        require('./routes/drcrop'));         console.log('✅ drcrop');         } catch(e) { console.log('❌ drcrop:', e.message); }
try { app.use('/api/weather',       require('./routes/weather'));        console.log('✅ weather');        } catch(e) { console.log('❌ weather:', e.message); }
try { app.use('/api/carbon',        require('./routes/carbon'));         console.log('✅ carbon');         } catch(e) { console.log('❌ carbon:', e.message); }
try { app.use('/api/payment',       require('./routes/payment'));        console.log('✅ payment');        } catch(e) { console.log('❌ payment:', e.message); }
try { app.use('/api/farm',          require('./routes/farm'));           console.log('✅ farm');           } catch(e) { console.log('❌ farm:', e.message); }
try { app.use('/api/coupon',        require('./routes/coupon'));         console.log('✅ coupon');         } catch(e) { console.log('❌ coupon:', e.message); }
try { app.use('/api/marketplace',   require('./routes/marketplace'));    console.log('✅ marketplace');    } catch(e) { console.log('❌ marketplace:', e.message); }
try { app.use('/api/stripe',        require('./routes/Stripe') || require('./routes/stripe')); console.log('✅ stripe'); } catch(e) { console.log('❌ stripe:', e.message); }
try { app.use('/api/iot',           require('./routes/iot'));            console.log('✅ iot');            } catch(e) { console.log('❌ iot:', e.message); }

// ── MANDI ──
try {
  const mandi = require('./routes/mandi');
  app.use('/api/mandi', mandi.router || mandi);
  app.get('/api/mandi/cron', async (req, res) => {
    try { const count = mandi.runScraper ? await mandi.runScraper() : 0; res.json({ success: true, count }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
  console.log('✅ mandi');
} catch(e) { console.log('❌ mandi:', e.message); }

app.use((req, res) => res.status(404).json({ error: 'Route not found', path: req.path }));

if (process.env.NODE_ENV !== 'production') {
  app.listen(process.env.PORT || 3000, () => console.log('RaastKar Backend running on port', process.env.PORT || 3000));
}
// Add these fields to your existing User model (models/User.js)
// Find your existing User schema and add:

const userSchema = new mongoose.Schema({
  // ... your existing fields ...
  
  // Add these new fields for social auth:
  facebookId:   { type: String, default: null },
  googleId:     { type: String, default: null },
  picture:      { type: String, default: '' },
  authProvider: { type: String, default: 'email' }, // 'email', 'google', 'facebook'
  
  // ... rest of your schema ...
});

// ─────────────────────────────────────────────
// Also add to server.js — Facebook route
// Place this BEFORE module.exports or app.listen
// ─────────────────────────────────────────────

// Install first: npm install axios
const axios = require('axios');

app.post('/api/auth/facebook', async (req, res) => {
  try {
    const { accessToken, userId, email, name, picture, country } = req.body;

    if (!email && !userId) {
      return res.json({ success: false, error: 'Missing credentials' });
    }

    // Verify with Facebook Graph API
    let verifiedData = { email, name };
    if (accessToken) {
      try {
        const { data } = await axios.get(
          `https://graph.facebook.com/me?fields=id,name,email&access_token=${accessToken}`
        );
        verifiedData.email = data.email || email;
        verifiedData.name  = data.name  || name;
      } catch (e) { /* use provided data */ }
    }

    if (!verifiedData.email) {
      return res.json({ success: false, error: 'Email permission required. Please allow email access on Facebook.' });
    }

    const emailLower = verifiedData.email.toLowerCase();
    
    // Find or create user
    let user = await User.findOne({
      $or: [{ email: emailLower }, { facebookId: userId }]
    });

    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await User.create({
        name:         verifiedData.name || 'Facebook User',
        email:        emailLower,
        facebookId:   userId,
        picture:      picture || '',
        country:      country || 'Global',
        authProvider: 'facebook',
        credits:      10,
        plan:         'Free Trial',
      });
    } else {
      if (!user.facebookId) {
        user.facebookId = userId;
        if (picture && !user.picture) user.picture = picture;
        await user.save();
      }
    }

    const token = require('jsonwebtoken').sign(
      { id: user._id },
      process.env.JWT_SECRET || 'raastkar_jwt_secret_2024',
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      isNewUser,
      user: {
        id:       user._id,
        name:     user.name,
        email:    user.email,
        picture:  user.picture || '',
        country:  user.country || 'Global',
        plan:     user.plan    || 'Free Trial',
        credits:  user.credits || 10,
      },
    });

  } catch (err) {
    console.error('FB auth error:', err.message);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

module.exports = app;