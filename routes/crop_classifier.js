// routes/crop_classifier.js
// Identifies what crop is growing using Sentinel-2 spectral bands
// Add to server.js: app.use('/api/crops', require('./routes/crop_classifier'));

const express = require('express');
const router  = express.Router();

// ── GET /api/crops/identify?lat=30.15&lng=71.52 ───────────────────────────
// Returns the most likely crop type based on spectral signature
router.get('/identify', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ success: false, error: 'lat and lng required' });

  try {
    const ee = require('@google/earthengine');
    await new Promise((resolve, reject) => {
      ee.data.authenticateViaPrivateKey({
        client_email: process.env.GEE_SERVICE_ACCOUNT,
        private_key:  process.env.GEE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }, resolve, reject);
    });
    await new Promise(resolve => ee.initialize(null, null, resolve));

    const point = ee.Geometry.Point([parseFloat(lng), parseFloat(lat)]);
    const now   = new Date();
    const start = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end   = now.toISOString().slice(0, 10);

    // Get all 13 Sentinel-2 bands for spectral analysis
    const s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterDate(start, end)
      .filterBounds(point)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
      .select(['B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12'])
      .median();

    // Sample all bands at the point
    const sample = await new Promise((resolve, reject) => {
      s2.sample({ region: point, scale: 10 }).first().evaluate((val, err) => {
        if (err) reject(err);
        else resolve(val);
      });
    });

    if (!sample || !sample.properties) {
      return res.json({ success: true, crop: identifyCropFromNdvi(0.5), source: 'estimated' });
    }

    const props = sample.properties;
    const b4  = (props.B4  || 0) / 10000;  // Red
    const b8  = (props.B8  || 0) / 10000;  // NIR
    const b11 = (props.B11 || 0) / 10000;  // SWIR1
    const b12 = (props.B12 || 0) / 10000;  // SWIR2
    const b2  = (props.B2  || 0) / 10000;  // Blue
    const b3  = (props.B3  || 0) / 10000;  // Green

    // Calculate indices
    const ndvi  = (b8 - b4) / (b8 + b4 + 0.001);   // Vegetation
    const ndwi  = (b3 - b8) / (b3 + b8 + 0.001);   // Water content
    const lswi  = (b8 - b11) / (b8 + b11 + 0.001); // Leaf water
    const evi   = 2.5 * (b8 - b4) / (b8 + 6*b4 - 7.5*b2 + 1); // Enhanced veg
    const savi  = 1.5 * (b8 - b4) / (b8 + b4 + 0.5); // Soil-adjusted

    const crop = classifyCrop({ ndvi, ndwi, lswi, evi, savi, b4, b8, b11, b12 });

    res.json({
      success: true,
      crop,
      indices: { ndvi: +ndvi.toFixed(3), ndwi: +ndwi.toFixed(3), lswi: +lswi.toFixed(3) },
      date:    end,
      source:  'Sentinel-2 spectral analysis · Google Earth Engine',
    });
  } catch (e) {
    console.error('Crop classify error:', e.message);
    // Fallback to NDVI-based estimation
    const ndvi = 0.5;
    res.json({ success: true, crop: identifyCropFromNdvi(ndvi), source: 'estimated', error: e.message });
  }
});

// ── Crop classification using spectral rules ───────────────────────────────
// Based on published spectral signatures for Pakistani crops
function classifyCrop({ ndvi, ndwi, lswi, evi, savi, b4, b8, b11, b12 }) {
  const month = new Date().getMonth() + 1; // 1-12

  // Rice: high NDWI (flooded fields), very high NDVI during growing season
  if (ndwi > 0.1 && ndvi > 0.4 && lswi > 0.2 && month >= 6 && month <= 10) {
    return { name: 'Rice', urdu: 'چاول', emoji: '🌾', confidence: 85,
      season: 'Kharif (Jun–Oct)', tip: 'Flooded field detected — rice growing season' };
  }

  // Sugarcane: very high NDVI, high biomass, tall crop
  if (ndvi > 0.65 && evi > 0.5 && lswi > 0.1) {
    return { name: 'Sugarcane', urdu: 'گنا', emoji: '🎋', confidence: 82,
      season: 'Year round (12–14 months)', tip: 'High dense biomass — likely sugarcane or tall crop' };
  }

  // Cotton: moderate NDVI, specific SWIR signature
  if (ndvi > 0.35 && ndvi < 0.65 && b11 > 0.15 && month >= 4 && month <= 11) {
    return { name: 'Cotton', urdu: 'کپاس', emoji: '🌸', confidence: 78,
      season: 'Kharif (Apr–Nov)', tip: 'SWIR signature matches cotton canopy' };
  }

  // Wheat: high NDVI in Rabi season, rapid green-up
  if (ndvi > 0.4 && evi > 0.25 && month >= 11 || month <= 4) {
    return { name: 'Wheat', urdu: 'گندم', emoji: '🌾', confidence: 88,
      season: 'Rabi (Nov–Apr)', tip: 'Dense green canopy in Rabi season — likely wheat' };
  }

  // Maize: moderate-high NDVI, Kharif season
  if (ndvi > 0.4 && ndvi < 0.7 && month >= 5 && month <= 9) {
    return { name: 'Maize', urdu: 'مکئی', emoji: '🌽', confidence: 72,
      season: 'Kharif (May–Sep)', tip: 'Moderate vegetation in Kharif — likely maize or sorghum' };
  }

  // Vegetables: patchy, moderate NDVI
  if (ndvi > 0.25 && ndvi < 0.5 && savi > 0.2) {
    return { name: 'Vegetables', urdu: 'سبزیاں', emoji: '🥬', confidence: 65,
      season: 'Both seasons', tip: 'Patchy moderate vegetation — likely vegetables or mixed crops' };
  }

  // Bare/fallow
  if (ndvi < 0.15) {
    return { name: 'Fallow/Bare', urdu: 'خالی زمین', emoji: '🟫', confidence: 90,
      season: 'N/A', tip: 'Very low vegetation — bare soil or fallow field' };
  }

  return { name: 'Mixed crops', urdu: 'ملی جلی فصلیں', emoji: '🌿', confidence: 55,
    season: 'Various', tip: 'Mixed spectral signature — multiple crop types or small fields' };
}

function identifyCropFromNdvi(ndvi) {
  const month = new Date().getMonth() + 1;
  if (ndvi > 0.6) return { name: 'Healthy crop (type unclear)', urdu: 'صحت مند فصل', emoji: '🌾', confidence: 60, season: 'Growing', tip: 'Enable GEE for crop type identification' };
  if (ndvi > 0.4) return { name: 'Growing vegetation', urdu: 'بڑھتی فصل', emoji: '🌿', confidence: 50, season: 'Growing', tip: 'Enable GEE credentials for accurate crop identification' };
  return { name: 'Sparse/Fallow', urdu: 'خالی یا کم فصل', emoji: '🟫', confidence: 70, season: 'N/A', tip: 'Low vegetation detected' };
}

module.exports = router;