// routes/ndvi_tiles.js
// Generates real pixel-level NDVI colored tile URL from Google Earth Engine
// Add to server.js: app.use('/api/ndvi', require('./routes/ndvi_tiles'));

const express = require('express');
const router  = express.Router();

// ── Cache tile URLs for 6 hours (Sentinel-2 updates every 5 days) ──────────
const tileCache = new Map();
const CACHE_MS   = 6 * 60 * 60 * 1000;

async function initGEE() {
  const ee = require('@google/earthengine');
  const serviceAccount = process.env.GEE_SERVICE_ACCOUNT;
  const privateKey     = process.env.GEE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!serviceAccount || !privateKey) throw new Error('GEE credentials not set');
  await new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      { client_email: serviceAccount, private_key: privateKey },
      resolve, reject
    );
  });
  await new Promise(resolve => ee.initialize(null, null, resolve));
  return ee;
}

// ── GET /api/ndvi/tiles?lat=30.15&lng=71.52&zoom=14 ───────────────────────
// Returns a tile URL template for Leaflet: {z}/{x}/{y}
router.get('/tiles', async (req, res) => {
  const { lat, lng, zoom = 12 } = req.query;
  if (!lat || !lng) return res.status(400).json({ success: false, error: 'lat and lng required' });

  const cacheKey = `${parseFloat(lat).toFixed(2)}_${parseFloat(lng).toFixed(2)}`;
  const cached   = tileCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_MS) {
    return res.json({ success: true, ...cached.data, source: 'cached' });
  }

  try {
    const ee     = await initGEE();
    const point  = ee.Geometry.Point([parseFloat(lng), parseFloat(lat)]);
    const now    = new Date();
    const start  = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end    = now.toISOString().slice(0, 10);

    // Sentinel-2 Surface Reflectance — last 30 days, <20% cloud
    const s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterDate(start, end)
      .filterBounds(point)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
      .select(['B4', 'B8'])
      .median();

    // NDVI = (NIR - Red) / (NIR + Red)
    const ndvi = s2.normalizedDifference(['B8', 'B4']).rename('NDVI');

    // Color palette: red → orange → yellow → light green → dark green
    // Matches Farmdar's visual style exactly
    const colored = ndvi.visualize({
      min:     -0.1,
      max:      0.8,
      palette: [
        '#E53935', // 0.0 and below = red (bare soil, dead)
        '#EF6C00', // 0.1 = orange (very sparse)
        '#F9A825', // 0.2 = amber (sparse)
        '#CDDC39', // 0.3 = yellow-green (moderate)
        '#66BB6A', // 0.4 = light green (growing)
        '#2E7D52', // 0.6 = medium green (healthy)
        '#1B5E20', // 0.8+ = dark green (dense/lush)
      ],
    });

    // Get tile URL from GEE
    const mapId = await new Promise((resolve, reject) => {
      colored.getMapId({}, (obj, err) => {
        if (err) reject(err);
        else resolve(obj);
      });
    });

    // Use backend proxy so browser doesn't need GEE auth
    const proxyTileUrl = `/api/ndvi/tile-proxy/{z}/{x}/{y}?mapid=${mapId.mapid}&token=${mapId.token}`;

    const data = {
      tileUrl:  proxyTileUrl,
      mapId:    mapId.mapid,
      token:    mapId.token,
      date:     end,
    };

    tileCache.set(cacheKey, { data, time: Date.now() });

    res.json({ success: true, ...data, source: 'Sentinel-2 · ESA · Google Earth Engine' });
  } catch (e) {
    console.error('GEE tiles error:', e.message);
    // Fallback: return public MODIS NDVI tiles (lower resolution but always works)
    res.json({
      success:  true,
      tileUrl:  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/2024-06-01/GoogleMapsCompatible/{z}/{y}/{x}.png',
      source:   'MODIS · NASA (fallback)',
      fallback: true,
      error:    e.message,
    });
  }
});

// ── GET /api/ndvi/pakistan-tiles ──────────────────────────────────────────
// Full Pakistan NDVI tile layer — cached aggressively (updates every 5 days)
router.get('/pakistan-tiles', async (req, res) => {
  const cacheKey = 'pakistan_ndvi';
  const cached   = tileCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_MS) {
    return res.json({ success: true, ...cached.data });
  }

  try {
    const ee = await initGEE();

    // Pakistan bounding box
    const pakistan = ee.Geometry.BBox(60.87, 23.69, 77.84, 37.13);

    const now   = new Date();
    const start = new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end   = now.toISOString().slice(0, 10);

    const s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterDate(start, end)
      .filterBounds(pakistan)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 25))
      .select(['B4', 'B8'])
      .median()
      .clip(pakistan);

    const ndvi = s2.normalizedDifference(['B8', 'B4']).rename('NDVI');

    const colored = ndvi.visualize({
      min:     -0.1,
      max:      0.8,
      palette: [
        '#E53935','#EF6C00','#F9A825',
        '#CDDC39','#66BB6A','#2E7D52','#1B5E20',
      ],
    });

    const mapId = await new Promise((resolve, reject) => {
      colored.getMapId({}, (obj, err) => {
        if (err) reject(err);
        else resolve(obj);
      });
    });

    const data = {
      tileUrl: `/api/ndvi/tile-proxy/{z}/{x}/{y}?mapid=${mapId.mapid}&token=${mapId.token}`,
      mapId:   mapId.mapid,
      token:   mapId.token,
      date:    end,
    };

    tileCache.set(cacheKey, { data, time: Date.now() });
    res.json({ success: true, ...data, source: 'Sentinel-2 Pakistan · ESA · GEE' });
  } catch (e) {
    console.error('Pakistan tiles error:', e.message);
    res.json({
      success:  true,
      tileUrl:  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/2024-06-01/GoogleMapsCompatible/{z}/{y}/{x}.png',
      source:   'MODIS NASA (fallback)',
      fallback: true,
    });
  }
});


// ── GET /api/ndvi/tile-proxy/:z/:x/:y ─────────────────────────────────────
// Proxies GEE tiles so browser doesn't need auth token
router.get('/tile-proxy/:z/:x/:y', async (req, res) => {
  const { z, x, y } = req.params;
  const { mapid, token } = req.query;
  if (!mapid) return res.status(400).send('mapid required');

  try {
    const geeUrl = `https://earthengine.googleapis.com/v1/${mapid}/tiles/${z}/${x}/${y}`;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const response = await fetch(geeUrl, { headers });
    if (!response.ok) {
      return res.status(response.status).send('Tile fetch failed');
    }

    const buffer = await response.arrayBuffer();
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error('Tile proxy error:', e.message);
    res.status(500).send('Tile proxy error');
  }
});

module.exports = router;