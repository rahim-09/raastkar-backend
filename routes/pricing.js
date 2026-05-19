const express = require('express');
const router = express.Router();

const ADMIN_KEY = 'raastkar_admin_2024';

// Default prices - change these anytime from admin panel!
let pricing = {
  plans: {
    free_trial: {
      name: 'Free Trial',
      credits: 5,
      price_pkr: 0,
      days: 30,
      active: true,
      description: '5 credits one time only',
    },
    starter: {
      name: 'Starter',
      credits: 40,
      price_pkr: 500,
      days: 30,
      active: true,
      description: '40 credits per month',
    },
    standard: {
      name: 'Standard',
      credits: 90,
      price_pkr: 1000,
      days: 30,
      active: true,
      description: '90 credits per month',
      popular: true,
    },
    pro: {
      name: 'Pro',
      credits: 200,
      price_pkr: 2000,
      days: 30,
      active: true,
      description: '200 credits per month',
    },
  },
  credit_costs: {
    crop_planner: 1,
    dr_crop_diagnosis: 2,
    dr_crop_photo: 3,
    weather_ai: 1,
    mandi_prices: 1,
    carbon_credits: 1,
    esg_score: 1,
    roi_calculator: 1,
  },
  payment_info: {
    easypaisa_number: '03002678621',
    jazzcash_number: '03002678621',
    account_name: 'ACEM Pakistan',
    bank_name: 'Bank Makramah Limited (Former Summit Bank Ltd)',
    bank_account: '0236586002000049',
    whatsapp: '03002678621',
  },
  app_settings: {
    free_trial_enabled: true,
    maintenance_mode: false,
    maintenance_message: 'App is under maintenance. Please try again later.',
    contact_email: 'support@raastkar.com',
    app_version: '1.0.0',
  }
};

// Get all pricing - PUBLIC endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    pricing: pricing,
    timestamp: new Date().toISOString(),
  });
});

// Get specific plan
router.get('/plan/:planKey', (req, res) => {
  const plan = pricing.plans[req.params.planKey];
  if (!plan) {
    return res.status(404).json({
      success: false,
      error: 'Plan not found',
    });
  }
  res.json({ success: true, plan });
});

// ADMIN - Update any pricing
router.post('/update', (req, res) => {
  const { key, updates } = req.body;

  if (key !== ADMIN_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  if (!updates) {
    return res.status(400).json({
      success: false,
      error: 'No updates provided',
    });
  }

  // Deep merge updates
  pricing = deepMerge(pricing, updates);

  res.json({
    success: true,
    message: 'Pricing updated successfully',
    pricing: pricing,
  });
});

// ADMIN - Update specific plan price
router.post('/plan/:planKey', (req, res) => {
  const { key, credits, price_pkr, days, active, description } = req.body;

  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const planKey = req.params.planKey;
  if (!pricing.plans[planKey]) {
    pricing.plans[planKey] = {};
  }

  if (credits !== undefined) pricing.plans[planKey].credits = parseInt(credits);
  if (price_pkr !== undefined) pricing.plans[planKey].price_pkr = parseInt(price_pkr);
  if (days !== undefined) pricing.plans[planKey].days = parseInt(days);
  if (active !== undefined) pricing.plans[planKey].active = active;
  if (description !== undefined) pricing.plans[planKey].description = description;

  res.json({
    success: true,
    message: `Plan ${planKey} updated`,
    plan: pricing.plans[planKey],
  });
});

// ADMIN - Update payment info
router.post('/payment-info', (req, res) => {
  const { key, ...info } = req.body;

  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  pricing.payment_info = {
    ...pricing.payment_info,
    ...info,
  };

  res.json({
    success: true,
    message: 'Payment info updated',
    payment_info: pricing.payment_info,
  });
});

// ADMIN - Update credit costs
router.post('/credit-costs', (req, res) => {
  const { key, ...costs } = req.body;

  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  pricing.credit_costs = {
    ...pricing.credit_costs,
    ...costs,
  };

  res.json({
    success: true,
    message: 'Credit costs updated',
    credit_costs: pricing.credit_costs,
  });
});

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