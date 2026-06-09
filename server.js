const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/',       (req, res) => res.json({ status: 'RaastKar Backend Running!', version: '1.0.5', timestamp: new Date().toISOString() }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

try { app.use('/api/pricing',       require('./routes/pricing'));       console.log('✅ pricing');       } catch(e) { console.log('❌ pricing:', e.message); }
try { app.use('/api/auth',          require('./routes/auth'));           console.log('✅ auth');           } catch(e) { console.log('❌ auth:', e.message); }
try { app.use('/api/remote-config', require('./routes/remote_config')); console.log('✅ remote-config'); } catch(e) { console.log('❌ remote-config:', e.message); }
try { app.use('/api/crop',          require('./routes/crop'));           console.log('✅ crop');           } catch(e) { console.log('❌ crop:', e.message); }
try { app.use('/api/drcrop',        require('./routes/drcrop'));         console.log('✅ drcrop');         } catch(e) { console.log('❌ drcrop:', e.message); }
try { app.use('/api/weather',       require('./routes/weather'));        console.log('✅ weather');        } catch(e) { console.log('❌ weather:', e.message); }
try { app.use('/api/carbon',        require('./routes/carbon'));         console.log('✅ carbon');         } catch(e) { console.log('❌ carbon:', e.message); }
try { app.use('/api/payment',       require('./routes/payment'));        console.log('✅ payment');        } catch(e) { console.log('❌ payment:', e.message); }
try { app.use('/api/farm',          require('./routes/farm'));           console.log('✅ farm');           } catch(e) { console.log('❌ farm:', e.message); }
try { app.use('/api/coupon',        require('./routes/coupon'));         console.log('✅ coupon');         } catch(e) { console.log('❌ coupon:', e.message); }
try { app.use('/api/stripe', require('./routes/stripe')); console.log('✅ stripe'); } catch(e) { console.log('❌ stripe:', e.message); }
try { app.use('/api/iot',  require('./routes/iot'));            console.log('✅ iot');            } catch(e) { console.log('❌ iot:', e.message); }
try { app.use('/api/loan',          require('./routes/loan'));           console.log('✅ loan');           } catch(e) { console.log('❌ loan:', e.message); }

// ── MANDI with scraper ──
try {
  const mandi = require('./routes/mandi');
  app.use('/api/mandi', mandi.router || mandi);
  app.get('/api/mandi/cron', async (req, res) => {
    try {
      const count = mandi.runScraper ? await mandi.runScraper() : 0;
      res.json({ success: true, count });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  console.log('✅ mandi + scraper');
} catch(e) { console.log('❌ mandi:', e.message); }

app.use((req, res) => res.status(404).json({ error: 'Route not found', path: req.path }));

if (process.env.NODE_ENV !== 'production') {
  app.listen(process.env.PORT || 3000, () => console.log('RaastKar Backend running on port', process.env.PORT || 3000));
}

module.exports = app;