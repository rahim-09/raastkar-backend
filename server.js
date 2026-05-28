const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'RaastKar Backend Running!',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Load routes safely
try {
  const pricingRoutes = require('./routes/pricing');
  app.use('/api/pricing', pricingRoutes);
} catch(e) {
  console.log('pricing route error:', e.message);
}

try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
} catch(e) {
  console.log('auth route error:', e.message);
}

try {
  const cropRoutes = require('./routes/crop');
  app.use('/api/crop', cropRoutes);
} catch(e) {
  console.log('crop route error:', e.message);
}

try {
  const drCropRoutes = require('./routes/drcrop');
  app.use('/api/drcrop', drCropRoutes);
} catch(e) {
  console.log('drcrop route error:', e.message);
}

try {
  const weatherRoutes = require('./routes/weather');
  app.use('/api/weather', weatherRoutes);
} catch(e) {
  console.log('weather route error:', e.message);
}

try {
  const mandiRoutes = require('./routes/mandi');
  app.use('/api/mandi', mandiRoutes);
} catch(e) {
  console.log('mandi route error:', e.message);
}

try {
  const carbonRoutes = require('./routes/carbon');
  app.use('/api/carbon', carbonRoutes);
} catch(e) {
  console.log('carbon route error:', e.message);
}

try {
  const paymentRoutes = require('./routes/payment');
  app.use('/api/payment', paymentRoutes);
} catch(e) {
  console.log('payment route error:', e.message);
}

try {
  const farmRoutes = require('./routes/farm');
  app.use('/api/farm', farmRoutes);
} catch(e) {
  console.log('farm route error:', e.message);
} 

try {
  const couponRoutes = require('./routes/coupon');
  app.use('/api/coupon', couponRoutes);
} catch(e) {
  console.log('coupon route error:', e.message);
}

// Only listen locally, NOT on Vercel
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`RaastKar Backend running on port ${PORT}`);
  });
}

const pricingRoutes = require('./routes/pricing');
app.use('/api/pricing', pricingRoutes);

// Export for Vercel
module.exports = app;