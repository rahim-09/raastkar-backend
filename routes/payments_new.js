const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const { authenticateToken, users } = require('./auth');
const { v4: uuidv4 } = require('uuid');

// Currency conversion rates (update regularly)
const currencyRates = {
  'PK': { currency: 'PKR', symbol: 'PKR', rate: 280 },
  'US': { currency: 'USD', symbol: '$', rate: 1 },
  'GB': { currency: 'GBP', symbol: '£', rate: 0.79 },
  'EU': { currency: 'EUR', symbol: '€', rate: 0.92 },
  'AE': { currency: 'AED', symbol: 'AED', rate: 3.67 },
  'SA': { currency: 'SAR', symbol: 'SAR', rate: 3.75 },
  'IN': { currency: 'INR', symbol: '₹', rate: 83 },
  'AU': { currency: 'AUD', symbol: 'A$', rate: 1.53 },
  'CA': { currency: 'CAD', symbol: 'C$', rate: 1.36 },
  'BD': { currency: 'BDT', symbol: '৳', rate: 110 },
};

// Credit packages
const packages = {
  basic: {
    id: 'basic',
    name: 'Basic Pack',
    credits: 100,
    price_usd: 10,
    popular: false,
    description: '100 AI credits',
  },
  premium: {
    id: 'premium',
    name: 'Premium Pack',
    credits: 300,
    price_usd: 25,
    popular: true,
    description: '300 AI credits — Best Value!',
    savings: 'Save $5',
  },
};

// Coupon storage
let coupons = [
  {
    code: 'RAASTKAR70',
    discount_percent: 70,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 3 months
    max_uses: 1000,
    used_count: 0,
    active: true,
  },
  {
    code: 'LAUNCH50',
    discount_percent: 50,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    max_uses: 500,
    used_count: 0,
    active: true,
  },
];

let payments = [];

// Get packages with country pricing
router.get('/packages', (req, res) => {
  const country = req.query.country || 'US';
  const rate = currencyRates[country] || currencyRates['US'];

  const localPackages = Object.values(packages).map(pkg => ({
    ...pkg,
    price_local: Math.round(pkg.price_usd * rate.rate),
    currency: rate.currency,
    symbol: rate.symbol,
    country,
  }));

  res.json({
    success: true,
    packages: localPackages,
    currency: rate,
  });
});

// Validate coupon
router.post('/validate-coupon', (req, res) => {
  const { code, country } = req.body;

  if (!code) {
    return res.status(400).json({
      success: false,
      error: 'Coupon code required'
    });
  }

  const coupon = coupons.find(
    c => c.code.toUpperCase() === code.toUpperCase()
  );

  if (!coupon) {
    return res.status(404).json({
      success: false,
      error: 'Invalid coupon code'
    });
  }

  if (!coupon.active) {
    return res.status(400).json({
      success: false,
      error: 'Coupon is no longer active'
    });
  }

  if (new Date() > new Date(coupon.expires_at)) {
    return res.status(400).json({
      success: false,
      error: 'Coupon has expired'
    });
  }

  if (coupon.used_count >= coupon.max_uses) {
    return res.status(400).json({
      success: false,
      error: 'Coupon limit reached'
    });
  }

  // Calculate discounted prices
  const rate = currencyRates[country || 'US'] || currencyRates['US'];
  const discountedPackages = Object.values(packages).map(pkg => {
    const discountedUsd = pkg.price_usd * (1 - coupon.discount_percent / 100);
    return {
      ...pkg,
      original_price_usd: pkg.price_usd,
      price_usd: discountedUsd,
      price_local: Math.round(discountedUsd * rate.rate),
      original_price_local: Math.round(pkg.price_usd * rate.rate),
      currency: rate.currency,
      symbol: rate.symbol,
    };
  });

  res.json({
    success: true,
    coupon: {
      code: coupon.code,
      discount_percent: coupon.discount_percent,
      expires_at: coupon.expires_at,
    },
    packages: discountedPackages,
  });
});

// Create Stripe payment intent
router.post('/stripe/create-intent', authenticateToken, async (req, res) => {
  try {
    const { packageId, couponCode, country } = req.body;
    const pkg = packages[packageId];

    if (!pkg) {
      return res.status(404).json({
        success: false,
        error: 'Package not found'
      });
    }

    let finalPriceUsd = pkg.price_usd;

    // Apply coupon if provided
    if (couponCode) {
      const coupon = coupons.find(
        c => c.code.toUpperCase() === couponCode.toUpperCase()
      );
      if (coupon && coupon.active &&
          new Date() < new Date(coupon.expires_at)) {
        finalPriceUsd = pkg.price_usd * (1 - coupon.discount_percent / 100);
      }
    }

    const amountInCents = Math.round(finalPriceUsd * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      metadata: {
        userId: req.userId,
        packageId,
        credits: pkg.credits,
        couponCode: couponCode || '',
      },
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      amount: finalPriceUsd,
      credits: pkg.credits,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Stripe webhook - auto add credits after payment
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const { userId, credits } = intent.metadata;

    const user = users.find(u => u.id === userId);
    if (user) {
      user.credits += parseInt(credits);
      console.log(`Added ${credits} credits to user ${userId}`);
    }
  }

  res.json({ received: true });
});

// Create PayPal order
router.post('/paypal/create-order', authenticateToken, async (req, res) => {
  try {
    const { packageId, couponCode, country } = req.body;
    const pkg = packages[packageId];

    if (!pkg) {
      return res.status(404).json({
        success: false,
        error: 'Package not found'
      });
    }

    let finalPriceUsd = pkg.price_usd;

    if (couponCode) {
      const coupon = coupons.find(
        c => c.code.toUpperCase() === couponCode.toUpperCase()
      );
      if (coupon && coupon.active &&
          new Date() < new Date(coupon.expires_at)) {
        finalPriceUsd = pkg.price_usd * (1 - coupon.discount_percent / 100);
        coupon.used_count++;
      }
    }

    // PayPal order simulation (replace with real PayPal SDK)
    const orderId = 'PAYPAL_' + uuidv4();

    payments.push({
      id: orderId,
      userId: req.userId,
      packageId,
      credits: pkg.credits,
      amount_usd: finalPriceUsd,
      method: 'paypal',
      status: 'pending',
      created_at: new Date().toISOString(),
      coupon: couponCode || null,
    });

    res.json({
      success: true,
      orderId,
      amount: finalPriceUsd,
      credits: pkg.credits,
      approvalUrl: `https://www.paypal.com/checkoutnow?token=${orderId}`,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Confirm PayPal payment
router.post('/paypal/confirm', authenticateToken, (req, res) => {
  const { orderId } = req.body;
  const payment = payments.find(p => p.id === orderId);

  if (!payment) {
    return res.status(404).json({
      success: false,
      error: 'Order not found'
    });
  }

  payment.status = 'completed';

  const user = users.find(u => u.id === req.userId);
  if (user) {
    user.credits += payment.credits;
  }

  res.json({
    success: true,
    credits_added: payment.credits,
    message: `${payment.credits} credits added to your account!`
  });
});

// ADMIN - Create coupon
router.post('/admin/coupon', (req, res) => {
  const { key, code, discount_percent, days_valid, max_uses } = req.body;

  if (key !== 'raastkar_admin_2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const expiryDays = parseInt(days_valid) || 90;
  const newCoupon = {
    code: code.toUpperCase(),
    discount_percent: parseInt(discount_percent) || 70,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString(),
    max_uses: parseInt(max_uses) || 1000,
    used_count: 0,
    active: true,
  };

  coupons.push(newCoupon);
  res.json({ success: true, coupon: newCoupon });
});

// ADMIN - Get all coupons
router.get('/admin/coupons', (req, res) => {
  if (req.query.key !== 'raastkar_admin_2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ success: true, coupons });
});

// ADMIN - Add credits to user manually
router.post('/admin/add-credits', (req, res) => {
  const { key, userId, credits } = req.body;
  if (key !== 'raastkar_admin_2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = users.find(u => u.id === userId || u.email === userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  user.credits += parseInt(credits);
  res.json({
    success: true,
    message: `${credits} credits added to ${user.email}`,
    new_total: user.credits - user.credits_used,
  });
});

module.exports = router;