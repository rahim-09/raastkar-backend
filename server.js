const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Health check ──
app.get('/', (req, res) => {
  res.json({
    status: 'RaastKar Backend Running!',
    version: '1.0.2',
    timestamp: new Date().toISOString()
  });
});
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ── Routes ──
try {
  const pricingRoutes = require('./routes/pricing');
  app.use('/api/pricing', pricingRoutes);
  console.log('✅ pricing loaded');
} catch(e) { console.log('❌ pricing:', e.message); }

try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ auth loaded');
} catch(e) { console.log('❌ auth:', e.message); }

try {
  const remoteConfigRoutes = require('./routes/remote_config');
  app.use('/api/remote-config', remoteConfigRoutes);
  console.log('✅ remote-config loaded');
} catch(e) { console.log('❌ remote-config:', e.message); }

try {
  const cropRoutes = require('./routes/crop');
  app.use('/api/crop', cropRoutes);
  console.log('✅ crop loaded');
} catch(e) { console.log('❌ crop:', e.message); }

try {
  const drCropRoutes = require('./routes/drcrop');
  app.use('/api/drcrop', drCropRoutes);
  console.log('✅ drcrop loaded');
} catch(e) { console.log('❌ drcrop:', e.message); }

try {
  const weatherRoutes = require('./routes/weather');
  app.use('/api/weather', weatherRoutes);
  console.log('✅ weather loaded');
} catch(e) { console.log('❌ weather:', e.message); }

try {
  const mandiRoutes = require('./routes/mandi');
  app.use('/api/mandi', mandiRoutes);
  console.log('✅ mandi loaded');
} catch(e) { console.log('❌ mandi:', e.message); }

try {
  const carbonRoutes = require('./routes/carbon');
  app.use('/api/carbon', carbonRoutes);
  console.log('✅ carbon loaded');
} catch(e) { console.log('❌ carbon:', e.message); }

try {
  const paymentRoutes = require('./routes/payment');
  app.use('/api/payment', paymentRoutes);
  console.log('✅ payment loaded');
} catch(e) { console.log('❌ payment:', e.message); }

try {
  const farmRoutes = require('./routes/farm');
  app.use('/api/farm', farmRoutes);
  console.log('✅ farm loaded');
} catch(e) { console.log('❌ farm:', e.message); }

try {
  const couponRoutes = require('./routes/coupon');
  app.use('/api/coupon', couponRoutes);
  console.log('✅ coupon loaded');
} catch(e) { console.log('❌ coupon:', e.message); }

try {
  const loanRoutes = require('./routes/loan');
  app.use('/api/loan', loanRoutes);
  console.log('✅ loan loaded');
} catch(e) { console.log('❌ loan:', e.message); }

// ── 404 handler ──
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// ── Local dev only ──
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`RaastKar Backend running on port ${PORT}`);
  });
}

module.exports = app;