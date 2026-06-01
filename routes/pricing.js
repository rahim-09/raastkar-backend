const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_KEY   = process.env.ADMIN_KEY || 'raastkar_admin_2024';

// ── MongoDB connection ──
let db = null;
async function getDB() {
  if (db) return db;
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db('raastkar');
  return db;
}

// ── Default pricing (used only if nothing in DB yet) ──
const DEFAULT_PRICING = {
  plans: {
    free_trial: {
      name: 'Free Trial', credits: 10, price_pkr: 0,
      days: 30, active: true, description: '10 credits one time only',
    },
    starter: {
      name: 'Individual', credits: 30, price_pkr: 1400,
      monthly: 5, annual: 50,
      days: 30, active: true, description: '30 credits per month',
      farmSize: 'Under 10 acres', emoji: '🌱',
    },
    standard: {
      name: 'Mid Size', credits: 50, price_pkr: 2800,
      monthly: 10, annual: 100,
      days: 30, active: true, popular: true,
      description: '50 credits per month',
      farmSize: '10 - 30 acres', emoji: '🚜',
    },
    pro: {
      name: 'Large', credits: 100, price_pkr: 5600,
      monthly: 20, annual: 200,
      days: 30, active: true, description: '100 credits per month',
      farmSize: '30 - 100 acres', emoji: '🌾',
    },
    mega: {
      name: 'Mega', credits: 200, price_pkr: 14000,
      monthly: 50, annual: 500,
      days: 30, active: true, description: '200 credits per month',
      farmSize: '100+ acres', emoji: '🏆',
    },
  },
  credit_costs: {
    crop_planner: 1,
    dr_crop_diagnosis: 2,
    dr_crop_photo: 3,
    weather_ai: 0,
    mandi_prices: 1,
    carbon_credits: 1,
    esg_score: 1,
    roi_calculator: 1,
  },
  payment_info: {
    easypaisa_number: '03002678621',
    jazzcash_number:  '03002678621',
    account_name:     'ACEM Pakistan',
    bank_name:        'Bank Makramah Limited',
    bank_account:     '0236586002000049',
    paypal:           'drivealafp@gmail.com',
    usdt_trc20:       'TVDyxYnsgnyuoALC1J8N7kxPX5kgnSK5Lc',
    whatsapp:         '03002678621',
  },
  app_settings: {
    free_trial_enabled:   true,
    maintenance_mode:     false,
    maintenance_message:  'App is under maintenance. Please try again later.',
    contact_email:        'invest@ignitethespark.org',
    app_version:          '1.0.2',
  },
};

// ── Helper: load pricing from MongoDB ──
async function loadPricing() {
  try {
    const database = await getDB();
    const doc = await database.collection('pricing').findOne({ _id: 'main' });
    if (doc) {
      delete doc._id;
      // Deep merge with defaults so new fields always exist
      return deepMerge(DEFAULT_PRICING, doc);
    }
  } catch (e) {
    console.error('loadPricing error:', e.message);
  }
  return DEFAULT_PRICING;
}

// ── Helper: save pricing to MongoDB ──
async function savePricing(pricingData) {
  const database = await getDB();
  await database.collection('pricing').updateOne(
    { _id: 'main' },
    { $set: { ...pricingData, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
}

// ══════════════════════════════════════════════════════
// PUBLIC ROUTES
// ══════════════════════════════════════════════════════

// GET /api/pricing — get all pricing
router.get('/', async (req, res) => {
  try {
    const pricing = await loadPricing();
    res.json({ success: true, pricing, timestamp: new Date().toISOString() });
  } catch (e) {
    res.json({ success: true, pricing: DEFAULT_PRICING });
  }
});

// GET /api/pricing/plans — get plans array (used by Flutter app)
router.get('/plans', async (req, res) => {
  try {
    const pricing = await loadPricing();
    // Convert plans object to array for Flutter
    const plansArr = Object.entries(pricing.plans).map(([key, plan]) => ({
      key, ...plan
    }));
    res.json({ success: true, plans: plansArr });
  } catch (e) {
    const plansArr = Object.entries(DEFAULT_PRICING.plans).map(([key, plan]) => ({
      key, ...plan
    }));
    res.json({ success: true, plans: plansArr });
  }
});

// GET /api/pricing/plan/:planKey
router.get('/plan/:planKey', async (req, res) => {
  try {
    const pricing = await loadPricing();
    const plan = pricing.plans[req.params.planKey];
    if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });
    res.json({ success: true, plan });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════

// POST /api/pricing/update — update ALL pricing (used by admin portal)
router.post('/update', async (req, res) => {
  const { key, plans, updates } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const current = await loadPricing();

    if (plans && Array.isArray(plans) && plans.length > 0) {
      // Array format: [{ key: 'starter', credits: 30, monthly: 5 }, ...]
      plans.forEach(function(p) {
        const k = p.key || (p.name || '').toLowerCase().replace(/\s+/g, '_');
        if (!k) return;
        if (!current.plans[k]) current.plans[k] = {};
        if (p.credits !== undefined) current.plans[k].credits = p.credits;
        if (p.monthly !== undefined) current.plans[k].monthly = p.monthly;
        if (p.annual  !== undefined) current.plans[k].annual  = p.annual;
        if (p.price_pkr !== undefined) current.plans[k].price_pkr = p.price_pkr;
      });
    } else if (plans && typeof plans === 'object' && !Array.isArray(plans)) {
      // Object format: { starter: { credits: 30 }, ... }
      current.plans = deepMerge(current.plans, plans);
    } else if (updates) {
      Object.assign(current, deepMerge(current, updates));
    }
    // If nothing provided, just return current (no error)

    await savePricing(current);
    res.json({ success: true, message: 'Pricing saved to database!', pricing: current });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/pricing/plan/:planKey — update single plan
router.post('/plan/:planKey', async (req, res) => {
  const { key, credits, price_pkr, monthly, annual, days, active, description } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const pricing = await loadPricing();
    const planKey = req.params.planKey;
    if (!pricing.plans[planKey]) pricing.plans[planKey] = {};

    if (credits     !== undefined) pricing.plans[planKey].credits     = parseInt(credits);
    if (price_pkr   !== undefined) pricing.plans[planKey].price_pkr   = parseInt(price_pkr);
    if (monthly     !== undefined) pricing.plans[planKey].monthly      = parseFloat(monthly);
    if (annual      !== undefined) pricing.plans[planKey].annual       = parseFloat(annual);
    if (days        !== undefined) pricing.plans[planKey].days         = parseInt(days);
    if (active      !== undefined) pricing.plans[planKey].active       = active;
    if (description !== undefined) pricing.plans[planKey].description  = description;

    await savePricing(pricing);
    res.json({ success: true, message: `Plan ${planKey} saved!`, plan: pricing.plans[planKey] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/pricing/payment-info — update payment info
router.post('/payment-info', async (req, res) => {
  const { key, ...info } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const pricing = await loadPricing();
    pricing.payment_info = { ...pricing.payment_info, ...info };
    await savePricing(pricing);
    res.json({ success: true, message: 'Payment info saved!', payment_info: pricing.payment_info });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/pricing/credit-costs — update credit costs
router.post('/credit-costs', async (req, res) => {
  const { key, ...costs } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const pricing = await loadPricing();
    pricing.credit_costs = { ...pricing.credit_costs, ...costs };
    await savePricing(pricing);
    res.json({ success: true, message: 'Credit costs saved!', credit_costs: pricing.credit_costs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Deep merge helper ──
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

module.exports = router;