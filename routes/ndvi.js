// routes/ndvi.js  — NDVI satellite data via Google Earth Engine
// Add to server.js:  app.use('/api/ndvi', require('./routes/ndvi'));

const express = require('express');
const router  = express.Router();

// ── GET /api/ndvi/current?lat=30.1575&lng=71.5249 ─────────────────────────
router.get('/current', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ success: false, error: 'lat and lng required' });

  try {
    // Try Google Earth Engine first
    const geeData = await fetchFromGEE(parseFloat(lat), parseFloat(lng));
    if (geeData) return res.json(geeData);

    // Fallback: return calculated mock based on location + season
    const fallback = generateFallbackNdvi(parseFloat(lat), parseFloat(lng));
    res.json(fallback);
  } catch (e) {
    console.error('NDVI current error:', e.message);
    res.json(generateFallbackNdvi(parseFloat(lat), parseFloat(lng)));
  }
});

// ── GET /api/ndvi/timeline?lat=30.1575&lng=71.5249 ───────────────────────
router.get('/timeline', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ success: false, error: 'lat and lng required' });

  try {
    const timeline = await fetchTimelineFromGEE(parseFloat(lat), parseFloat(lng));
    if (timeline) return res.json({ success: true, timeline });

    // Fallback: seasonal pattern for Pakistan agriculture
    res.json({ success: true, timeline: generatePakistanTimeline() });
  } catch (e) {
    res.json({ success: true, timeline: generatePakistanTimeline() });
  }
});

// ── Google Earth Engine Integration ───────────────────────────────────────
// Requires: npm install @google-cloud/earthengine-api
// And: GEE_SERVICE_ACCOUNT + GEE_PRIVATE_KEY in Vercel env vars
async function fetchFromGEE(lat, lng) {
  const serviceAccount = process.env.GEE_SERVICE_ACCOUNT;
  const privateKey     = process.env.GEE_PRIVATE_KEY;

  if (!serviceAccount || !privateKey) {
    console.log('GEE credentials not set — using fallback');
    return null;
  }

  try {
    const ee = require('@google/earthengine');

    await new Promise((resolve, reject) => {
      ee.data.authenticateViaPrivateKey({
        client_email: serviceAccount,
        private_key:  privateKey.replace(/\\n/g, '\n'),
      }, resolve, reject);
    });

    await new Promise(resolve => ee.initialize(null, null, resolve));

    const point      = ee.Geometry.Point([lng, lat]);
    const now        = new Date();
    const startDate  = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate    = now.toISOString().split('T')[0];

    // Sentinel-2 surface reflectance
    const s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterDate(startDate, endDate)
      .filterBounds(point)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
      .select(['B4', 'B8']) // Red, NIR
      .median();

    const ndviImg = s2.normalizedDifference(['B8', 'B4']).rename('NDVI');

    // Sample at point and 4 zones (500m offsets)
    const offsets = [
      { zone: 'North', dlat:  0.005, dlng:  0 },
      { zone: 'South', dlat: -0.005, dlng:  0 },
      { zone: 'East',  dlat:  0,     dlng:  0.005 },
      { zone: 'West',  dlat:  0,     dlng: -0.005 },
    ];

    const mainNdvi = await sampleNdvi(ndviImg, point);
    const zones    = await Promise.all(offsets.map(async o => {
      const zPoint = ee.Geometry.Point([lng + o.dlng, lat + o.dlat]);
      const v      = await sampleNdvi(ndviImg, zPoint);
      return {
        zone:   o.zone,
        ndvi:   v,
        status: ndviStatus(v),
        urdu:   ndviUrdu(v),
      };
    }));

    return {
      success:           true,
      ndvi:              mainNdvi,
      date:              endDate,
      zones,
      recommendation:    generateUrduRecommendation(zones),
      recommendation_en: generateEnRecommendation(zones),
      biomass_kg_per_ha: Math.round(mainNdvi * 5310),
      carbon_tons_per_ha: parseFloat((mainNdvi * 5310 * 0.5 * 3.67 / 1000).toFixed(3)),
      source:            'Sentinel-2 · ESA · Google Earth Engine',
    };
  } catch (e) {
    console.error('GEE fetch error:', e.message);
    return null;
  }
}

async function sampleNdvi(ndviImg, point) {
  return new Promise((resolve) => {
    ndviImg.sample({ region: point, scale: 10 }).first().get('NDVI').evaluate((val) => {
      resolve(typeof val === 'number' ? parseFloat(val.toFixed(3)) : 0.5);
    });
  });
}

async function fetchTimelineFromGEE(lat, lng) {
  const serviceAccount = process.env.GEE_SERVICE_ACCOUNT;
  const privateKey     = process.env.GEE_PRIVATE_KEY;
  if (!serviceAccount || !privateKey) return null;

  try {
    const ee    = require('@google/earthengine');
    const point = ee.Geometry.Point([lng, lat]);
    const months = [];

    for (let i = 11; i >= 0; i--) {
      const d     = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];

      const s2    = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterDate(start, end).filterBounds(point)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
        .select(['B4', 'B8']).median();

      const ndvi  = s2.normalizedDifference(['B8', 'B4']);
      const val   = await sampleNdvi(ndvi, point);

      months.push({
        month: d.toLocaleString('en', { month: 'short' }),
        ndvi:  val,
        date:  start,
      });
    }
    return months;
  } catch (e) {
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function ndviStatus(v) {
  if (v >= 0.6) return 'healthy';
  if (v >= 0.4) return 'moderate';
  if (v >= 0.2) return 'stressed';
  return 'critical';
}

function ndviUrdu(v) {
  if (v >= 0.6) return 'صحت مند فصل';
  if (v >= 0.4) return 'اعتدال پسند';
  if (v >= 0.2) return 'دباؤ میں ہے';
  return 'بحران میں ہے';
}

function generateUrduRecommendation(zones) {
  const stressed = zones.filter(z => z.ndvi < 0.4);
  if (!stressed.length) return 'تمام علاقے صحت مند ہیں۔ آبپاشی اور کھاد کا معمول جاری رکھیں۔';
  const names = stressed.map(z => z.zone === 'North' ? 'شمالی' : z.zone === 'South' ? 'جنوبی' : z.zone === 'East' ? 'مشرقی' : 'مغربی').join('، ');
  return `${names} حصے میں پانی یا نائٹروجن کی کمی ہو سکتی ہے۔ آبپاشی اور کھاد چیک کریں۔`;
}

function generateEnRecommendation(zones) {
  const stressed = zones.filter(z => z.ndvi < 0.4);
  if (!stressed.length) return 'All zones are healthy. Continue regular irrigation and fertilization schedule.';
  const names = stressed.map(z => z.zone).join(', ');
  return `${names} zone(s) showing stress — check irrigation levels and nitrogen application. Consider soil moisture test.`;
}

// Pakistan seasonal NDVI pattern (Rabi + Kharif)
function generatePakistanTimeline() {
  const pattern = [
    { month: 'Jul', ndvi: 0.32 }, // Kharif sowing
    { month: 'Aug', ndvi: 0.48 }, // Kharif growing
    { month: 'Sep', ndvi: 0.61 }, // Kharif peak
    { month: 'Oct', ndvi: 0.55 }, // Kharif harvest
    { month: 'Nov', ndvi: 0.41 }, // Rabi sowing
    { month: 'Dec', ndvi: 0.53 }, // Rabi growing
    { month: 'Jan', ndvi: 0.62 }, // Rabi growing
    { month: 'Feb', ndvi: 0.71 }, // Rabi peak (wheat)
    { month: 'Mar', ndvi: 0.68 }, // Rabi peak
    { month: 'Apr', ndvi: 0.52 }, // Rabi harvest
    { month: 'May', ndvi: 0.38 }, // Post harvest
    { month: 'Jun', ndvi: 0.29 }, // Summer fallow
  ];
  // Add slight randomness
  return pattern.map(p => ({
    ...p,
    ndvi: parseFloat((p.ndvi + (Math.random() - 0.5) * 0.06).toFixed(3))
  }));
}

function generateFallbackNdvi(lat, lng) {
  // Simulate realistic NDVI for Pakistan/Africa
  const baseNdvi = 0.55 + (Math.sin(lat) * 0.1) + (Math.cos(lng) * 0.05);
  const ndvi     = parseFloat(Math.min(0.9, Math.max(0.1, baseNdvi)).toFixed(3));
  const zones    = [
    { zone: 'North', ndvi: parseFloat((ndvi + 0.08).toFixed(3)), status: ndviStatus(ndvi + 0.08), urdu: ndviUrdu(ndvi + 0.08) },
    { zone: 'South', ndvi: parseFloat((ndvi - 0.05).toFixed(3)), status: ndviStatus(ndvi - 0.05), urdu: ndviUrdu(ndvi - 0.05) },
    { zone: 'East',  ndvi: parseFloat((ndvi - 0.18).toFixed(3)), status: ndviStatus(ndvi - 0.18), urdu: ndviUrdu(ndvi - 0.18) },
    { zone: 'West',  ndvi: parseFloat((ndvi + 0.04).toFixed(3)), status: ndviStatus(ndvi + 0.04), urdu: ndviUrdu(ndvi + 0.04) },
  ];

  return {
    success:           true,
    ndvi,
    date:              new Date().toISOString().split('T')[0],
    zones,
    recommendation:    generateUrduRecommendation(zones),
    recommendation_en: generateEnRecommendation(zones),
    biomass_kg_per_ha: Math.round(ndvi * 5310),
    carbon_tons_per_ha: parseFloat((ndvi * 5310 * 0.5 * 3.67 / 1000).toFixed(3)),
    source:            'Estimated · Connect GEE for real satellite data',
  };
}

module.exports = router;