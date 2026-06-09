const express = require('express');
const router  = express.Router();
const { MongoClient } = require('mongodb');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const ADMIN_KEY     = process.env.ADMIN_KEY || 'raastkar_admin_2024';

let _db = null;
async function getDB() {
  if (_db) return _db;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  _db = client.db('raastkar');
  return _db;
}

// Lazy-load Stripe so server doesn't crash if key missing
function getStripe() {
  if (!STRIPE_SECRET) throw new Error('STRIPE_SECRET_KEY not set in environment');
  return require('stripe')(STRIPE_SECRET);
}

// ── POST /api/stripe/create-payment-intent ──
// Called by Flutter to get a clientSecret for card payment
router.post('/create-payment-intent', async (req, res) => {
  try {
    const stripe     = getStripe();
    const { amount, currency, planKey, planName, userId, billingCycle, couponCode, discountPercent } = req.body;

    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    // Amount in cents (Stripe uses smallest currency unit)
    const amountCents = Math.round(parseFloat(amount) * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount:   amountCents,
      currency: (currency || 'usd').toLowerCase(),
      metadata: {
        userId:         userId        || '',
        planKey:        planKey       || '',
        planName:       planName      || '',
        billingCycle:   billingCycle  || 'monthly',
        couponCode:     couponCode    || '',
        discountPercent: String(discountPercent || 0),
      },
      automatic_payment_methods: { enabled: true },
    });

    res.json({
      success:      true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (e) {
    console.error('Stripe create-payment-intent error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/stripe/confirm-payment ──
// Called by Flutter after card payment succeeds
router.post('/confirm-payment', async (req, res) => {
  try {
    const stripe = getStripe();
    const { paymentIntentId, userId, planKey, planName, billingCycle, credits, couponCode } = req.body;

    // Verify payment with Stripe
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (intent.status !== 'succeeded') {
      return res.status(400).json({ success: false, error: 'Payment not completed. Status: ' + intent.status });
    }

    const db  = await getDB();
    const doc = {
      userId:          userId       || '',
      planKey:         planKey      || '',
      planName:        planName     || '',
      billingCycle:    billingCycle || 'monthly',
      method:          'Stripe',
      paymentIntentId: paymentIntentId,
      amountUSD:       intent.amount / 100,
      currency:        intent.currency,
      credits:         parseInt(credits) || 0,
      couponCode:      couponCode   || '',
      status:          'approved',  // Stripe = instant approval
      stripeStatus:    intent.status,
      created_at:      new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    };

    await db.collection('payments').insertOne(doc);

    // Add credits to user immediately (Stripe is instant — no manual approval needed)
    if (userId) {
      const user = await db.collection('users').findOne({ _id: userId });
      const currentCredits = user?.credits || 0;
      await db.collection('users').updateOne(
        { _id: userId },
        { $set: { credits: currentCredits + parseInt(credits), plan: planName, updated_at: new Date().toISOString() } }
      );
    }

    res.json({ success: true, message: 'Payment confirmed! Credits added.', credits: parseInt(credits) });
  } catch (e) {
    console.error('Stripe confirm error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/stripe/webhook ──
// Stripe calls this automatically when payment events happen
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig     = req.headers['stripe-signature'];
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
    const stripe = getStripe();
    event = secret
      ? stripe.webhooks.constructEvent(req.body, sig, secret)
      : JSON.parse(req.body.toString());
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const db     = await getDB();
    await db.collection('payments').updateOne(
      { paymentIntentId: intent.id },
      { $set: { status: 'approved', stripeStatus: 'succeeded', updated_at: new Date().toISOString() } }
    );
    console.log('✅ Webhook: payment succeeded', intent.id);
  }

  res.json({ received: true });
});

// ── GET /api/stripe/payments ── admin
router.get('/payments', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db   = await getDB();
    const list = await db.collection('payments')
      .find({ method: 'Stripe' }).sort({ created_at: -1 }).toArray();
    res.json({ success: true, payments: list, total: list.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;