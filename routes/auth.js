const express = require('express');
const router = express.Router();

const profiles = {};

router.post('/profile', (req, res) => {
  const { uid, name, location, farm_size,
          language, phone, crops_grown } = req.body;

  if (!uid || !name) {
    return res.status(400).json({
      success: false,
      error: 'uid and name are required'
    });
  }

  profiles[uid] = {
    uid, name, location, farm_size,
    language: language || 'English',
    phone, crops_grown: crops_grown || [],
    updated_at: new Date().toISOString()
  };

  res.json({ success: true, message: 'Profile saved' });
});

router.get('/profile/:uid', (req, res) => {
  const { uid } = req.params;
  const profile = profiles[uid];

  if (!profile) {
    return res.status(404).json({
      success: false,
      error: 'Profile not found'
    });
  }

  res.json({ success: true, profile });
});

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Auth service running',
    time: new Date().toISOString()
  });
});

module.exports = router;