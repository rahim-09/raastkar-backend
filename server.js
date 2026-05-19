const express = require('express');
const cors = require('cors');
require('dotenv').config();
const admin = require('firebase-admin');

const paymentRoutes = require('./routes/payment');
app.use('/api/payment', paymentRoutes);

let serviceAccount;
try {
  serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (e) {
  console.log('Firebase not configured yet - skipping');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const cropRoutes    = require('./routes/crop');
const drCropRoutes  = require('./routes/drcrop');
const weatherRoutes = require('./routes/weather');
const mandiRoutes   = require('./routes/mandi');
const carbonRoutes  = require('./routes/carbon');
const authRoutes    = require('./routes/auth');

app.use('/api/crop',    cropRoutes);
app.use('/api/drcrop',  drCropRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/mandi',   mandiRoutes);
app.use('/api/carbon',  carbonRoutes);
app.use('/api/auth',    authRoutes);

app.get('/', (req, res) => {
  res.json({
    status: 'RaastKar API is running',
    version: '1.0.0',
    endpoints: [
      'POST /api/crop/recommend',
      'POST /api/drcrop/diagnose',
      'GET  /api/weather/current',
      'GET  /api/weather/forecast',
      'GET  /api/mandi/prices',
      'POST /api/carbon/calculate',
      'GET  /api/carbon/my-credits',
      'POST /api/auth/profile',
      'GET  /api/auth/profile'
    ]
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Something went wrong' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('=====================================');
  console.log('  RaastKar Backend Running!');
  console.log(`  http://localhost:${PORT}`);
  console.log('=====================================');
});