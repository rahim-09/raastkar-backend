const express      = require('express');
const router       = express.Router();
const { MongoClient } = require('mongodb');
const https        = require('https');
const http         = require('http');

const ADMIN_KEY = process.env.ADMIN_KEY || 'raastkar_admin_2024';
let _db = null;

async function getDB() {
  if (_db) return _db;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  _db = client.db('raastkar');
  return _db;
}

// ── Fetch a URL (returns text) ──
function fetchURL(url, options) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, options || {}, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── POST request helper ──
function postURL(url, postData, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(postData);
    req.end();
  });
}

// ── Parse price from string ──
function parsePrice(str) {
  if (!str) return 0;
  const cleaned = str.toString().replace(/[^0-9.]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num);
}

// ── Extract table rows from HTML ──
function extractTableRows(html, tableId) {
  const rows = [];
  // Find table
  const tableMatch = tableId
    ? html.match(new RegExp(`id=["|']${tableId}["|'][^>]*>([\\s\\S]*?)</table>`, 'i'))
    : html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);

  if (!tableMatch) return rows;
  const tableHtml = tableMatch[1] || tableMatch[0];

  // Extract rows
  const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  for (const row of rowMatches) {
    const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [])
      .map(cell => cell.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').trim());
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

// ══════════════════════════════════════════════════════════════
// ── SCRAPER: amis.pk ──
// ══════════════════════════════════════════════════════════════
async function scrapeAMIS() {
  const results = [];
  const today   = new Date().toISOString().split('T')[0];

  const crops = [
    { name: 'Wheat',          emoji: '🌾', urdu: 'گندم',    id: '1'  },
    { name: 'Rice (Basmati)', emoji: '🍚', urdu: 'باسمتی',  id: '2'  },
    { name: 'Rice (IRRI)',    emoji: '🍚', urdu: 'آئی آر آر آئی', id: '3' },
    { name: 'Maize',          emoji: '🌽', urdu: 'مکئی',    id: '4'  },
    { name: 'Cotton',         emoji: '🌿', urdu: 'کپاس',    id: '5'  },
    { name: 'Sugarcane',      emoji: '🎋', urdu: 'گنا',     id: '6'  },
    { name: 'Onion',          emoji: '🧅', urdu: 'پیاز',    id: '7'  },
    { name: 'Potato',         emoji: '🥔', urdu: 'آلو',     id: '8'  },
    { name: 'Tomato',         emoji: '🍅', urdu: 'ٹماٹر',   id: '9'  },
    { name: 'Garlic',         emoji: '🧄', urdu: 'لہسن',    id: '10' },
    { name: 'Mango',          emoji: '🥭', urdu: 'آم',      id: '11' },
    { name: 'Orange',         emoji: '🍊', urdu: 'مالٹا',   id: '12' },
  ];

  const cities = [
    { name: 'Lahore',       id: '1'  },
    { name: 'Faisalabad',   id: '2'  },
    { name: 'Multan',       id: '3'  },
    { name: 'Rawalpindi',   id: '4'  },
    { name: 'Gujranwala',   id: '5'  },
    { name: 'Sahiwal',      id: '6'  },
    { name: 'Bahawalpur',   id: '7'  },
    { name: 'Sialkot',      id: '8'  },
  ];

  try {
    const dateStr = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\//g, '-');

    for (const crop of crops.slice(0, 6)) { // scrape top 6 crops
      try {
        const postData = `CommodityId=${crop.id}&DateFrom=${dateStr}&DateTo=${dateStr}&MarketId=0`;
        const html = await postURL(
          'https://amis.pk/CommodityRates/GetCommodityWiseRates',
          postData,
          { 'Referer': 'https://amis.pk/CommodityRates/CommodityWiseReport' }
        );

        const rows = extractTableRows(html);
        for (const row of rows) {
          if (row.length >= 4) {
            const cityName = row[0] || '';
            const minPrice = parsePrice(row[1]);
            const maxPrice = parsePrice(row[2]);
            const avgPrice = parsePrice(row[3]) || Math.round((minPrice + maxPrice) / 2);

            if (avgPrice > 100) { // valid price
              results.push({
                crop:      crop.name,
                emoji:     crop.emoji,
                urdu:      crop.urdu,
                city:      cityName.trim(),
                min_price: minPrice,
                max_price: maxPrice,
                avg_price: avgPrice,
                unit:      '40kg',
                source:    'amis.pk',
                date:      today,
                scraped_at: new Date().toISOString(),
              });
            }
          }
        }
        await new Promise(r => setTimeout(r, 1000)); // be polite - 1s delay
      } catch (e) {
        console.log(`AMIS scrape error for ${crop.name}:`, e.message);
      }
    }
  } catch (e) {
    console.log('AMIS main error:', e.message);
  }

  return results;
}

// ══════════════════════════════════════════════════════════════
// ── SCRAPER: kisan.com.pk ──
// ══════════════════════════════════════════════════════════════
async function scrapeKisan() {
  const results = [];
  const today   = new Date().toISOString().split('T')[0];

  const cropSlugs = [
    { name: 'Wheat',    emoji: '🌾', slug: 'wheat'    },
    { name: 'Rice',     emoji: '🍚', slug: 'rice'     },
    { name: 'Onion',    emoji: '🧅', slug: 'onion'    },
    { name: 'Potato',   emoji: '🥔', slug: 'potato'   },
    { name: 'Tomato',   emoji: '🍅', slug: 'tomato'   },
    { name: 'Cotton',   emoji: '🌿', slug: 'cotton'   },
    { name: 'Mango',    emoji: '🥭', slug: 'mango'    },
    { name: 'Garlic',   emoji: '🧄', slug: 'garlic'   },
    { name: 'Maize',    emoji: '🌽', slug: 'maize'    },
    { name: 'Sugarcane',emoji: '🎋', slug: 'sugarcane'},
  ];

  for (const crop of cropSlugs) {
    try {
      const html = await fetchURL(
        `https://www.kisan.com.pk/mandi-rates/${crop.slug}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }
      );

      // Extract price rows from table
      const rows = extractTableRows(html);
      for (const row of rows) {
        if (row.length >= 3) {
          const city     = row[0] || '';
          const minPrice = parsePrice(row[1]);
          const maxPrice = parsePrice(row[2]);
          const avgPrice = Math.round((minPrice + maxPrice) / 2);

          if (avgPrice > 50 && city.length > 2) {
            results.push({
              crop:       crop.name,
              emoji:      crop.emoji,
              city:       city.trim(),
              min_price:  minPrice,
              max_price:  maxPrice,
              avg_price:  avgPrice,
              unit:       '40kg',
              source:     'kisan.com.pk',
              date:       today,
              scraped_at: new Date().toISOString(),
            });
          }
        }
      }
      await new Promise(r => setTimeout(r, 1200));
    } catch (e) {
      console.log(`Kisan scrape error for ${crop.name}:`, e.message);
    }
  }
  return results;
}

// ══════════════════════════════════════════════════════════════
// ── FALLBACK: Realistic Pakistan prices (when scraping fails) ──
// ══════════════════════════════════════════════════════════════
function getFallbackPrices() {
  const today = new Date().toISOString().split('T')[0];
  const cities = ['Lahore','Faisalabad','Multan','Rawalpindi','Karachi','Peshawar','Quetta','Hyderabad','Gujranwala','Sialkot'];

  // Base prices per 40kg (maund) — approximate Pakistan 2025 market rates
  const basePrices = [
    { crop: 'Wheat',          emoji: '🌾', urdu: 'گندم',      base: 3800, variance: 200, unit: '40kg'  },
    { crop: 'Rice (Basmati)', emoji: '🍚', urdu: 'باسمتی',    base: 5200, variance: 300, unit: '40kg'  },
    { crop: 'Rice (IRRI)',    emoji: '🍚', urdu: 'آئی آر آر آئی', base: 3200, variance: 200, unit: '40kg' },
    { crop: 'Maize',          emoji: '🌽', urdu: 'مکئی',      base: 2800, variance: 150, unit: '40kg'  },
    { crop: 'Cotton',         emoji: '🌿', urdu: 'کپاس',      base: 8500, variance: 500, unit: '40kg'  },
    { crop: 'Sugarcane',      emoji: '🎋', urdu: 'گنا',       base: 400,  variance: 30,  unit: '40kg'  },
    { crop: 'Onion',          emoji: '🧅', urdu: 'پیاز',      base: 1800, variance: 300, unit: '40kg'  },
    { crop: 'Potato',         emoji: '🥔', urdu: 'آلو',       base: 2200, variance: 250, unit: '40kg'  },
    { crop: 'Tomato',         emoji: '🍅', urdu: 'ٹماٹر',     base: 3500, variance: 600, unit: '40kg'  },
    { crop: 'Garlic',         emoji: '🧄', urdu: 'لہسن',      base: 9000, variance: 800, unit: '40kg'  },
    { crop: 'Mango',          emoji: '🥭', urdu: 'آم',        base: 4500, variance: 500, unit: '40kg'  },
    { crop: 'Orange',         emoji: '🍊', urdu: 'مالٹا',     base: 3200, variance: 400, unit: '40kg'  },
    { crop: 'Banana',         emoji: '🍌', urdu: 'کیلا',      base: 2800, variance: 300, unit: '40kg'  },
    { crop: 'Chili (Red)',    emoji: '🌶️', urdu: 'لال مرچ',   base: 12000,variance: 1000,unit: '40kg'  },
    { crop: 'Lentils (Daal)', emoji: '🫘', urdu: 'دال',       base: 7500, variance: 500, unit: '40kg'  },
    { crop: 'Groundnut',      emoji: '🥜', urdu: 'مونگ پھلی', base: 8000, variance: 600, unit: '40kg'  },
    { crop: 'Sunflower',      emoji: '🌻', urdu: 'سورج مکھی', base: 5500, variance: 400, unit: '40kg'  },
    { crop: 'Mustard',        emoji: '🌱', urdu: 'سرسوں',     base: 6200, variance: 500, unit: '40kg'  },
  ];

  const results = [];
  for (const crop of basePrices) {
    for (const city of cities) {
      const variance   = Math.round((Math.random() - 0.5) * crop.variance);
      const avgPrice   = crop.base + variance;
      const minPrice   = avgPrice - Math.round(crop.variance * 0.2);
      const maxPrice   = avgPrice + Math.round(crop.variance * 0.2);

      results.push({
        crop:       crop.crop,
        emoji:      crop.emoji,
        urdu:       crop.urdu || '',
        city:       city,
        min_price:  Math.max(0, minPrice),
        max_price:  maxPrice,
        avg_price:  Math.max(0, avgPrice),
        unit:       crop.unit,
        source:     'estimated',
        date:       today,
        scraped_at: new Date().toISOString(),
      });
    }
  }
  return results;
}

// ══════════════════════════════════════════════════════════════
// ── MAIN SCRAPE FUNCTION ──
// ══════════════════════════════════════════════════════════════
async function runScraper() {
  console.log('🌾 Starting mandi price scraper...');
  const db = await getDB();

  let prices = [];

  // Try amis.pk first
  try {
    console.log('Trying amis.pk...');
    const amisPrices = await scrapeAMIS();
    if (amisPrices.length > 0) {
      prices = prices.concat(amisPrices);
      console.log(`✅ amis.pk: ${amisPrices.length} prices scraped`);
    }
  } catch (e) {
    console.log('amis.pk failed:', e.message);
  }

  // Try kisan.com.pk
  try {
    console.log('Trying kisan.com.pk...');
    const kisanPrices = await scrapeKisan();
    if (kisanPrices.length > 0) {
      prices = prices.concat(kisanPrices);
      console.log(`✅ kisan.com.pk: ${kisanPrices.length} prices scraped`);
    }
  } catch (e) {
    console.log('kisan.com.pk failed:', e.message);
  }

  // Use fallback if scraping failed
  if (prices.length < 10) {
    console.log('Using fallback prices...');
    prices = getFallbackPrices();
  }

  // Save to MongoDB
  const today = new Date().toISOString().split('T')[0];
  await db.collection('mandi_prices').deleteMany({ date: today });
  await db.collection('mandi_prices').insertMany(prices);

  // Update last scraped time
  await db.collection('mandi_meta').updateOne(
    { _id: 'last_scrape' },
    { $set: { timestamp: new Date().toISOString(), count: prices.length, date: today } },
    { upsert: true }
  );

  console.log(`✅ Scraper done: ${prices.length} prices saved`);
  return prices.length;
}

// ══════════════════════════════════════════════════════════════
// ── API ROUTES ──
// ══════════════════════════════════════════════════════════════

// GET /api/mandi — get all prices (optionally filter by city/crop)
router.get('/', async (req, res) => {
  try {
    const db    = await getDB();
    const today = new Date().toISOString().split('T')[0];

    let query = { date: today };
    if (req.query.city)  query.city  = { $regex: req.query.city,  $options: 'i' };
    if (req.query.crop)  query.crop  = { $regex: req.query.crop,  $options: 'i' };

    let prices = await db.collection('mandi_prices').find(query).sort({ crop: 1, city: 1 }).toArray();

    // If no prices for today, trigger scraper
    if (prices.length === 0) {
      console.log('No prices for today, running scraper...');
      try {
        await runScraper();
        prices = await db.collection('mandi_prices').find(query).sort({ crop: 1, city: 1 }).toArray();
      } catch (e) {
        // Use fallback
        prices = getFallbackPrices().filter(p => {
          if (req.query.city && !p.city.toLowerCase().includes(req.query.city.toLowerCase())) return false;
          if (req.query.crop && !p.crop.toLowerCase().includes(req.query.crop.toLowerCase())) return false;
          return true;
        });
      }
    }

    // Get meta
    const meta = await db.collection('mandi_meta').findOne({ _id: 'last_scrape' });

    // Get unique cities and crops
    const allPrices   = await db.collection('mandi_prices').find({ date: today }).toArray();
    const cities      = [...new Set(allPrices.map(p => p.city))].sort();
    const crops       = [...new Set(allPrices.map(p => p.crop))].sort();

    res.json({
      success:      true,
      prices:       prices,
      total:        prices.length,
      cities:       cities,
      crops:        crops,
      lastUpdated:  meta?.timestamp || new Date().toISOString(),
      source:       prices[0]?.source || 'estimated',
      date:         today,
    });
  } catch (e) {
    console.error('mandi get error:', e.message);
    // Emergency fallback
    const prices = getFallbackPrices();
    res.json({
      success:     true,
      prices:      prices,
      total:       prices.length,
      lastUpdated: new Date().toISOString(),
      source:      'estimated',
      date:        new Date().toISOString().split('T')[0],
    });
  }
});

// GET /api/mandi/cities — get all available cities
router.get('/cities', async (req, res) => {
  try {
    const db    = await getDB();
    const today = new Date().toISOString().split('T')[0];
    const docs  = await db.collection('mandi_prices').distinct('city', { date: today });
    res.json({ success: true, cities: docs.sort() });
  } catch (e) {
    res.json({ success: true, cities: ['Lahore','Faisalabad','Multan','Rawalpindi','Karachi','Peshawar','Quetta','Gujranwala'] });
  }
});

// GET /api/mandi/crops — get all available crops
router.get('/crops', async (req, res) => {
  try {
    const db    = await getDB();
    const today = new Date().toISOString().split('T')[0];
    const docs  = await db.collection('mandi_prices').distinct('crop', { date: today });
    res.json({ success: true, crops: docs.sort() });
  } catch (e) {
    res.json({ success: true, crops: ['Wheat','Rice (Basmati)','Cotton','Onion','Potato','Tomato'] });
  }
});

// POST /api/mandi/scrape — manually trigger scraper (admin only)
router.post('/scrape', async (req, res) => {
  if (req.body.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const count = await runScraper();
    res.json({ success: true, message: `Scraped ${count} prices`, count });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/mandi/status — check scraper status
router.get('/status', async (req, res) => {
  try {
    const db   = await getDB();
    const meta = await db.collection('mandi_meta').findOne({ _id: 'last_scrape' });
    const today = new Date().toISOString().split('T')[0];
    const count = await db.collection('mandi_prices').countDocuments({ date: today });
    res.json({ success: true, lastScrape: meta?.timestamp, pricesAvailable: count, date: today });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = { router, runScraper };