// ── Remote Config API ──
// File: C:\Users\rahim\raastkar_backend\routes\remote_config.js

const express = require('express');
const router = express.Router();
const { getDB } = require('../db');

const ADMIN_KEY = process.env.ADMIN_KEY || 'raastkar_admin_2024';

// ── GET config (called by Flutter app on startup) ──
router.get('/', async (req, res) => {
  try {
    const db = await getDB();
    const config = await db.collection('remote_config').findOne({ _id: 'app_config' });
    res.json({ success: true, config: config || getDefaultConfig() });
  } catch (e) {
    res.json({ success: true, config: getDefaultConfig() });
  }
});

// ── UPDATE config (called by admin portal) ──
router.post('/update', async (req, res) => {
  const { key, updates } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db = await getDB();
    await db.collection('remote_config').updateOne(
      { _id: 'app_config' },
      { $set: { ...updates, updated_at: new Date().toISOString() } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function getDefaultConfig() {
  return {
    // ── App Status ──
    app_enabled: true,
    maintenance_mode: false,
    maintenance_message: 'App is under maintenance. Back soon!',

    // ── Announcements ──
    show_announcement: false,
    announcement_title: '',
    announcement_message: '',
    announcement_color: '#2E7D52',

    // ── Feature Flags ──
    features: {
      crop_planner: true,
      dr_crop: true,
      weather: true,
      mandi: true,
      marketplace: true,
      carbon: true,
      esg: true,
      roi: true,
    },

    // ── Credit Costs ──
    credit_costs: {
      crop_planner: 1,
      dr_crop_symptom: 2,
      dr_crop_photo: 3,
      mandi: 1,
      carbon: 1,
      esg: 1,
      roi: 1,
      weather: 0,
    },

    // ── App Text ──
    app_tagline: 'AgriGPT for Farmers',
    support_phone: '03002678621',
    support_email: 'invest@ignitethespark.org',

    // ── Force Update ──
    force_update: false,
    min_version: '1.0.0',
    update_url: 'https://play.google.com/store/apps/details?id=com.raastkar.farming',
    update_message: 'A new version is available. Please update to continue.',
  };
}

module.exports = router;