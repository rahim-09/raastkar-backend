// routes/ndvi_alerts.js
// WhatsApp zone alerts when NDVI drops 15%+
// Add to server.js: app.use('/api/alerts', require('./routes/ndvi_alerts'));

const express = require('express');
const router  = express.Router();
const { MongoClient } = require('mongodb');

let _db = null;
async function getDB() {
  if (_db) return _db;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  _db = client.db('raastkar');
  return _db;
}

// WhatsApp message via WhatsApp Business API or wa.me link
async function sendWhatsAppAlert(phone, message) {
  // Option 1: WhatsApp Business API (if you have it)
  // Option 2: Use wa.me link (user clicks to send)
  // Option 3: Use Twilio WhatsApp (paid)
  
  // For now — log and store. Farmer sees alert in app.
  console.log('WhatsApp alert to', phone, ':', message);
  return true;
}

// ── POST /api/alerts/subscribe ─────────────────────────────────────────────
// Farmer subscribes to NDVI alerts for their farm
router.post('/subscribe', async (req, res) => {
  try {
    const { userId, phone, lat, lng, farmName, threshold = 0.15 } = req.body;
    if (!userId || !lat || !lng) {
      return res.status(400).json({ success: false, error: 'userId, lat, lng required' });
    }

    const db = await getDB();
    await db.collection('ndvi_subscriptions').updateOne(
      { userId },
      {
        $set: {
          userId, phone, lat, lng, farmName: farmName || 'My Farm',
          threshold,       // Alert when NDVI drops by this % (default 15%)
          lastNdvi:   null,
          lastCheck:  null,
          alertCount: 0,
          active:     true,
          createdAt:  new Date().toISOString(),
        }
      },
      { upsert: true }
    );

    res.json({ success: true, message: 'Alert subscription saved! We will notify you when farm health changes.' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/alerts/my-alerts/:userId ─────────────────────────────────────
router.get('/my-alerts/:userId', async (req, res) => {
  try {
    const db     = await getDB();
    const alerts = await db.collection('ndvi_alerts')
      .find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    res.json({ success: true, alerts });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/alerts/check ─────────────────────────────────────────────────
// Called by cron job — checks all subscriptions and sends alerts if needed
router.post('/check', async (req, res) => {
  const { key } = req.body;
  if (key !== (process.env.ADMIN_KEY || 'raastkar_admin_2024')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db   = await getDB();
    const subs = await db.collection('ndvi_subscriptions')
      .find({ active: true }).toArray();

    let alertsSent = 0;

    for (const sub of subs) {
      try {
        // Fetch current NDVI for this farm
        const res2 = await fetch(
          `https://raastkar-backend.vercel.app/api/ndvi/current?lat=${sub.lat}&lng=${sub.lng}`
        );
        const data = await res2.json();
        if (!data.success) continue;

        const currentNdvi = data.ndvi;
        const lastNdvi    = sub.lastNdvi;

        if (lastNdvi !== null) {
          const drop = lastNdvi - currentNdvi;
          const dropPct = drop / lastNdvi;

          if (dropPct >= sub.threshold) {
            // NDVI dropped significantly — send alert!
            const zones   = data.zones || [];
            const stressed = zones.filter(z => z.ndvi < 0.4);
            const zoneNames = stressed.map(z => z.zone).join(', ');

            const message = `🚨 RaastKar Farm Alert!\n\n` +
              `Farm: ${sub.farmName}\n` +
              `Health dropped from ${lastNdvi.toFixed(2)} → ${currentNdvi.toFixed(2)}\n` +
              `Drop: ${(dropPct * 100).toFixed(0)}% in the past week\n\n` +
              (zoneNames ? `⚠️ Stressed zones: ${zoneNames}\n\n` : '') +
              `Possible causes:\n` +
              `• Water stress — check irrigation\n` +
              `• Nitrogen deficiency — apply fertilizer\n` +
              `• Pest/disease damage — check field\n\n` +
              `Open RaastKar for full analysis:\n` +
              `https://raastkar.com/ndvi_map.html?lat=${sub.lat}&lng=${sub.lng}&ndvi=${currentNdvi.toFixed(2)}&name=${encodeURIComponent(sub.farmName)}`;

            // Send WhatsApp
            if (sub.phone) {
              await sendWhatsAppAlert(sub.phone, message);
            }

            // Save alert to DB
            await db.collection('ndvi_alerts').insertOne({
              userId:      sub.userId,
              farmName:    sub.farmName,
              phone:       sub.phone,
              previousNdvi: lastNdvi,
              currentNdvi,
              dropPercent: (dropPct * 100).toFixed(1),
              stressedZones: zoneNames,
              message,
              whatsappUrl: `https://wa.me/${sub.phone?.replace(/\D/g,'')}?text=${encodeURIComponent(message)}`,
              createdAt:   new Date().toISOString(),
            });

            alertsSent++;

            // Update subscription alert count
            await db.collection('ndvi_subscriptions').updateOne(
              { userId: sub.userId },
              { $inc: { alertCount: 1 }, $set: { lastNdvi: currentNdvi, lastCheck: new Date().toISOString() } }
            );
          }
        }

        // Update last NDVI reading
        await db.collection('ndvi_subscriptions').updateOne(
          { userId: sub.userId },
          { $set: { lastNdvi: currentNdvi, lastCheck: new Date().toISOString() } }
        );

      } catch (err) {
        console.error('Alert check error for', sub.userId, ':', err.message);
      }
    }

    res.json({ success: true, checked: subs.length, alertsSent });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;