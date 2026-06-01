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

// ── Default plans (fallback only) ─────────────────────
const DEFAULT_PLANS = [
  {
    key:       'individual',
    name:      'Individual',
    emoji:     '🌱',
    farmSize:  'Under 10 acres',
    credits:   30,
    monthly:   5,
    annual:    50,
    price_pkr: 1400,
    popular:   false,
    active:    true,
    features:  ['30 credits per month','AI Crop Planner','Dr Crop Diagnosis','Weather forecasts','Mandi prices','Email support'],
  },
  {
    key:       'midsize',
    name:      'Mid Size',
    emoji:     '🚜',
    farmSize:  '10 - 30 acres',
    credits:   50,
    monthly:   10,
    annual:    100,
    price_pkr: 2800,
    popular:   true,
    active:    true,
    features:  ['50 credits per month','All Individual features','Carbon Credits calculator','ESG Score tracking','ROI Calculator','Priority WhatsApp support'],
  },
  {
    key:       'large',
    name:      'Large',
    emoji:     '🌾',
    farmSize:  '30 - 100 acres',
    credits:   100,
    monthly:   20,
    annual:    200,
    price_pkr: 5600,
    popular:   false,
    active:    true,
    features:  ['100 credits per month','All Mid Size features','Multiple farm profiles','Advanced analytics','Export reports PDF','Dedicated account manager'],
  },
  {
    key:       'mega',
    name:      'Mega',
    emoji:     '🏆',
    farmSize:  '100+ acres',
    credits:   200,
    monthly:   50,
    annual:    500,
    price_pkr: 14000,
    popular:   false,
    active:    true,
    features:  ['200 credits per month','All Large features','API access','Custom integrations','Bulk data export','Priority dedicated support','Custom reports'],
  },
];

// ── Load plans from MongoDB ────────────────────────────
async function loadPlans() {
  try {
    const db  = await getDB();
    const doc = await db.collection('pricing_plans').findOne({ _id: 'plans' });
    if (doc && doc.plans && doc.plans.length > 0) {
      return doc.plans;
    }
  } catch (e) {
    console.error('loadPlans error:', e.message);
  }
  return DEFAULT_PLANS;
}

// ── Save plans to MongoDB ──────────────────────────────
async function savePlans(plans) {
  const db = await getDB();
  await db.collection('pricing_plans').updateOne(
    { _id: 'plans' },
    { $set: { plans, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
}

// ══════════════════════════════════════════════════════
// PUBLIC ROUTES
// ══════════════════════════════════════════════════════

// GET /api/pricing
// Returns all plans — used by Flutter app
router.get('/', async (req, res) => {
  try {
    const plans = await loadPlans();
    res.json({ success: true, plans, timestamp: new Date().toISOString() });
  } catch (e) {
    res.json({ success: true, plans: DEFAULT_PLANS });
  }
});

// GET /api/pricing/plans
// Same as above — alias for Flutter app
router.get('/plans', async (req, res) => {
  try {
    const plans = await loadPlans();
    res.json({ success: true, plans });
  } catch (e) {
    res.json({ success: true, plans: DEFAULT_PLANS });
  }
});

// ══════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════

// POST /api/pricing/admin/save
// Save ALL plans at once — used by admin portal
router.post('/admin/save', async (req, res) => {
  const { key, plans } = req.body;

  if (key !== ADMIN_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  if (!plans || !Array.isArray(plans) || plans.length === 0) {
    return res.status(400).json({ success: false, error: 'Plans array required' });
  }

  try {
    await savePlans(plans);
    res.json({ success: true, message: 'All plans saved to database!', plans });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/pricing/admin/update-plan
// Update a single plan by key — used by admin portal edit form
router.post('/admin/update-plan', async (req, res) => {
  const { key, planKey, credits, monthly, annual, price_pkr, popular, active } = req.body;

  if (key !== ADMIN_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  if (!planKey) {
    return res.status(400).json({ success: false, error: 'planKey required' });
  }

  try {
    const plans = await loadPlans();
    const idx   = plans.findIndex(p => p.key === planKey);

    if (idx < 0) {
      return res.status(404).json({ success: false, error: 'Plan not found: ' + planKey });
    }

    // Only update fields that were sent
    if (credits   !== undefined) plans[idx].credits   = Number(credits);
    if (monthly   !== undefined) plans[idx].monthly   = Number(monthly);
    if (annual    !== undefined) plans[idx].annual    = Number(annual);
    if (price_pkr !== undefined) plans[idx].price_pkr = Number(price_pkr);
    if (popular   !== undefined) plans[idx].popular   = Boolean(popular);
    if (active    !== undefined) plans[idx].active    = Boolean(active);

    await savePlans(plans);
    res.json({ success: true, message: `Plan "${planKey}" saved!`, plan: plans[idx], plans });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/pricing/plan/:planKey  (legacy — keep for backward compat)
router.post('/plan/:planKey', async (req, res) => {
  const { key, credits, monthly, annual, price_pkr } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const plans = await loadPlans();
    const idx   = plans.findIndex(p => p.key === req.params.planKey);
    if (idx < 0) return res.status(404).json({ success: false, error: 'Plan not found' });

    if (credits   !== undefined) plans[idx].credits   = Number(credits);
    if (monthly   !== undefined) plans[idx].monthly   = Number(monthly);
    if (annual    !== undefined) plans[idx].annual    = Number(annual);
    if (price_pkr !== undefined) plans[idx].price_pkr = Number(price_pkr);

    await savePlans(plans);
    res.json({ success: true, message: 'Plan saved!', plan: plans[idx] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/pricing/update  (legacy — keep for backward compat)
router.post('/update', async (req, res) => {
  const { key, plans } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const current = await loadPlans();
    if (plans && Array.isArray(plans) && plans.length > 0) {
      await savePlans(plans);
      return res.json({ success: true, message: 'Plans saved!', plans });
    }
    res.json({ success: true, message: 'No changes', plans: current });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;