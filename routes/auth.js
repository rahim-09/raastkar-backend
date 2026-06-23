const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const crypto  = require('crypto');
const uuidv4  = () => crypto.randomUUID();
const { MongoClient, ObjectId } = require('mongodb');

const JWT_SECRET           = process.env.JWT_SECRET || 'raastkar_jwt_secret_2024';
const GOOGLE_WEB_CLIENT_ID = '145955067465-hguvgbhk5iu47u2ldme2vpqn36a5bjnl.apps.googleusercontent.com';
const GOOGLE_AND_CLIENT_ID = '145955067465-hguvgbhk5iu47u2ldme2vpqn36a5bjnl.apps.googleusercontent.com';
const ADMIN_KEY            = process.env.ADMIN_KEY || 'raastkar_admin_2024';
const googleClient         = new OAuth2Client();

// ── Notification emails ───────────────────────────────────────────────────
const NOTIFY_EMAILS = [
  'farid.premani@gmail.com',
  'invest@ignitethespark.org',
  'rahimaliajmal14@gmail.com',
];

let db = null;
async function getDB() {
  if (db) return db;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db('raastkar');
  return db;
}

// ── Send new user notification email ─────────────────────────────────────
async function sendNewUserNotification(user) {
  try {
    const nodemailer   = require('nodemailer');
    const transporter  = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER || '',
        pass: process.env.GMAIL_PASS || '',
      },
    });

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
        <div style="background:#2E7D52;padding:20px 24px;border-radius:10px 10px 0 0">
          <h2 style="color:#fff;margin:0;font-size:20px">🌱 New RaastKar User!</h2>
        </div>
        <div style="background:#f9f9f9;padding:20px 24px;border-radius:0 0 10px 10px;
                    border:1px solid #e0e0e0;border-top:none">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#666;width:100px">Name</td>
                <td style="padding:6px 0;font-weight:600">${user.name || '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Email</td>
                <td style="padding:6px 0">${user.email || '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Phone</td>
                <td style="padding:6px 0">${user.phone || '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Country</td>
                <td style="padding:6px 0">${user.country || '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Method</td>
                <td style="padding:6px 0">
                  <span style="background:#E8F5E9;color:#2E7D52;padding:2px 10px;
                               border-radius:10px;font-size:12px;font-weight:600">
                    ${user.loginMethod || 'email'}
                  </span>
                </td></tr>
            <tr><td style="padding:6px 0;color:#666">Joined</td>
                <td style="padding:6px 0">${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })} PKT</td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0">
          <p style="color:#aaa;font-size:11px;margin:0">
            RaastKar Smart Farming Pakistan · Patent #19/675,514 · Ignite the Spark Foundation
          </p>
        </div>
      </div>`;

    await transporter.sendMail({
      from:    `"RaastKar App" <${process.env.GMAIL_USER}>`,
      to:      NOTIFY_EMAILS.join(','),
      subject: `🌱 New User: ${user.name || user.email || user.phone}`,
      html,
    });
    console.log('✅ New user notification sent:', user.name || user.email);
  } catch (e) {
    console.error('Email notification error:', e.message);
    // Don't throw — email failure should never block signup
  }
}

// ── CORS ──────────────────────────────────────────────────────────────────
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin',  '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

function buildUser(u) {
  return {
    id:           u.id,
    email:        u.email        || '',
    name:         u.name         || '',
    phone:        u.phone        || '',
    country:      u.country      || 'Global',
    credits:      u.credits      || 10,
    credits_used: u.credits_used || 0,
    plan:         u.plan         || 'Free Trial',
    picture:      u.picture      || '',
    is_google:    u.is_google    || false,
  };
}

function makeToken(user) {
  return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}

// ─────────────────────────────────────────
// REGISTER (email/password)
// ─────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, country, idType, idNumber, idImage } = req.body;
    if (!email || !password || !name)
      return res.status(400).json({ success: false, error: 'Email, password and name required' });

    const db    = await getDB();
    const users = db.collection('users');

    if (await users.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ success: false, error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user   = {
      id:                 uuidv4(),
      email:              email.toLowerCase(),
      password:           hashed,
      name,
      phone:              '',
      country:            country || 'Global',
      credits:            10,
      credits_used:       0,
      plan:               'Free Trial',
      joined_at:          new Date().toISOString(),
      last_login:         new Date().toISOString(),
      is_google:          false,
      loginMethod:        'email',
      free_credits_given: true,
      id_type:            idType   || '',
      id_number:          idNumber || '',
      id_image:           idImage  || '',
      id_verified:        false,
    };
    await users.insertOne(user);

    // Send notification to team
    sendNewUserNotification({ ...user, loginMethod: 'email' });

    res.json({
      success:   true,
      message:   'Account created! 10 free credits added.',
      token:     makeToken(user),
      user:      buildUser(user),
      isNewUser: true,
    });
  } catch (e) {
    console.error('Register error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────
// LOGIN (email/password)
// ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, error: 'Email and password required' });

    const db    = await getDB();
    const users = db.collection('users');
    const user  = await users.findOne({ email: email.toLowerCase() });

    if (!user)  return res.status(401).json({ success: false, error: 'Email not found' });
    const valid = await bcrypt.compare(password, user.password || '');
    if (!valid) return res.status(401).json({ success: false, error: 'Wrong password' });

    await users.updateOne({ id: user.id }, { $set: { last_login: new Date().toISOString() } });
    res.json({ success: true, token: makeToken(user), user: buildUser(user) });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────
// GOOGLE LOGIN
// ─────────────────────────────────────────
router.post('/google', async (req, res) => {
  try {
    const { idToken, accessToken, email, name, picture, country } = req.body;
    const db    = await getDB();
    const users = db.collection('users');

    let gEmail = email, gName = name, gPic = picture;
    if (idToken) {
      try {
        const ticket  = await googleClient.verifyIdToken({ idToken, audience: [GOOGLE_WEB_CLIENT_ID, GOOGLE_AND_CLIENT_ID] });
        const payload = ticket.getPayload();
        gEmail = payload.email;
        gName  = payload.name;
        gPic   = payload.picture;
      } catch (_) {}
    }
    if (!gEmail) return res.status(400).json({ success: false, error: 'Could not get email from Google' });

    let user    = await users.findOne({ email: gEmail.toLowerCase() });
    const isNew = !user;

    if (!user) {
      user = {
        id:                 uuidv4(),
        email:              gEmail.toLowerCase(),
        password:           '',
        name:               gName || gEmail.split('@')[0],
        phone:              '',
        country:            country || 'Global',
        credits:            10,
        credits_used:       0,
        plan:               'Free Trial',
        joined_at:          new Date().toISOString(),
        last_login:         new Date().toISOString(),
        is_google:          true,
        loginMethod:        'google',
        picture:            gPic || '',
        free_credits_given: true,
      };
      await users.insertOne(user);
      // Send notification to team
      sendNewUserNotification({ ...user, loginMethod: 'google' });
    } else {
      await users.updateOne({ id: user.id }, { $set: { last_login: new Date().toISOString(), picture: gPic || user.picture || '' } });
      user = await users.findOne({ email: gEmail.toLowerCase() });
    }

    res.json({ success: true, token: makeToken(user), isNewUser: isNew, user: buildUser(user) });
  } catch (e) {
    console.error('Google login error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────
// PHONE LOGIN (Firebase verified)
// ─────────────────────────────────────────
router.post('/phone-login', async (req, res) => {
  try {
    const { phone, name, uid, firebaseToken } = req.body;
    if (!phone || !uid)
      return res.status(400).json({ success: false, error: 'Phone and uid required' });

    const db    = await getDB();
    const users = db.collection('users');

    // Find by phone or firebase uid
    let user    = await users.findOne({ $or: [{ phone }, { firebaseUid: uid }] });
    const isNew = !user;

    if (!user) {
      // New user — create account
      user = {
        id:                 uuidv4(),
        email:              '',
        password:           '',
        name:               name || 'Farmer',
        phone,
        firebaseUid:        uid,
        country:            'PK',
        credits:            10,
        credits_used:       0,
        plan:               'Free Trial',
        joined_at:          new Date().toISOString(),
        last_login:         new Date().toISOString(),
        is_google:          false,
        loginMethod:        'phone',
        free_credits_given: true,
      };
      await users.insertOne(user);

      // Send notification to team
      sendNewUserNotification({ ...user, loginMethod: 'phone' });
    } else {
      await users.updateOne(
        { id: user.id },
        { $set: { last_login: new Date().toISOString(), firebaseUid: uid } }
      );
      user = await users.findOne({ $or: [{ phone }, { firebaseUid: uid }] });
    }

    const token = jwt.sign(
      { userId: user.id, phone, uid },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success:   true,
      token,
      isNew,
      user:      buildUser(user),
    });
  } catch (e) {
    console.error('Phone login error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────
// AUTH MIDDLEWARE
// ─────────────────────────────────────────
function authenticateToken(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });
  try {
    req.userId = jwt.verify(token, JWT_SECRET).userId;
    next();
  } catch (_) {
    res.status(403).json({ error: 'Invalid token' });
  }
}

// ─────────────────────────────────────────
// USE CREDIT
// ─────────────────────────────────────────
router.post('/use-credit', authenticateToken, async (req, res) => {
  try {
    const { amount = 1 } = req.body;
    const db    = await getDB();
    const users = db.collection('users');
    const user  = await users.findOne({ id: req.userId });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const remaining = (user.credits || 0) - (user.credits_used || 0);
    if (remaining < amount) return res.status(400).json({ success: false, error: 'Not enough credits' });

    await users.updateOne({ id: req.userId }, { $inc: { credits_used: amount } });
    const updated = await users.findOne({ id: req.userId });
    res.json({
      success:      true,
      credits:      updated.credits,
      credits_used: updated.credits_used,
      remaining:    updated.credits - updated.credits_used,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────
// PROFILE GET
// ─────────────────────────────────────────
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await (await getDB()).collection('users').findOne({ id: req.userId });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, user: { ...buildUser(user), phone: user.phone || '', farmLocation: user.farmLocation || '', credits_total: user.credits || 10, joined_at: user.joined_at } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────
// PROFILE UPDATE
// ─────────────────────────────────────────
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, country, phone, farmLocation } = req.body;
    const db    = await getDB();
    const users = db.collection('users');
    await users.updateOne({ id: req.userId }, { $set: { name, country, phone, farmLocation } });
    res.json({ success: true, user: buildUser(await users.findOne({ id: req.userId })) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────
// CHANGE PASSWORD
// ─────────────────────────────────────────
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const db    = await getDB();
    const users = db.collection('users');
    const user  = await users.findOne({ id: req.userId });
    if (!user)          return res.status(404).json({ success: false, error: 'User not found' });
    if (user.is_google) return res.status(400).json({ success: false, error: 'Google accounts cannot change password' });
    if (!await bcrypt.compare(currentPassword, user.password || ''))
      return res.status(401).json({ success: false, error: 'Current password is wrong' });
    await users.updateOne({ id: req.userId }, { $set: { password: await bcrypt.hash(newPassword, 10) } });
    res.json({ success: true, message: 'Password changed!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────
// ADMIN — ALL USERS
// ─────────────────────────────────────────
router.get('/admin/users', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const all = await (await getDB()).collection('users').find({}).toArray();
    res.json({
      success: true, total: all.length,
      users: all.map(u => ({
        id: u.id, email: u.email, name: u.name, phone: u.phone || '',
        country: u.country, credits: u.credits || 0, credits_used: u.credits_used || 0,
        credits_remaining: (u.credits || 0) - (u.credits_used || 0),
        plan: u.plan, joined_at: u.joined_at, last_login: u.last_login,
        is_google: u.is_google || false, loginMethod: u.loginMethod || 'email',
        id_type: u.id_type || '', id_number: u.id_number || '',
        id_image: u.id_image || '', id_verified: u.id_verified || false,
      })),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────
// ADMIN — ADD CREDITS
// ─────────────────────────────────────────
router.post('/admin/add-credits', async (req, res) => {
  const { key, email, credits } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db    = await getDB();
    const users = db.collection('users');
    const user  = await users.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await users.updateOne({ email: email.toLowerCase() }, { $inc: { credits: parseInt(credits) } });
    res.json({ success: true, message: `${credits} credits added to ${email}` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────
// ADMIN — VERIFY ID
// ─────────────────────────────────────────
router.post('/admin/verify-id', async (req, res) => {
  const { key, userId, verified } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    await (await getDB()).collection('users').updateOne({ id: userId }, { $set: { id_verified: verified } });
    res.json({ success: true, message: verified ? 'ID verified!' : 'ID unverified' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────
// ADMIN — BLOCK USER
// ─────────────────────────────────────────
router.post('/admin/block-user', async (req, res) => {
  const { key, userId, block } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    await (await getDB()).collection('users').updateOne({ id: userId }, { $set: { is_blocked: block === true } });
    res.json({ success: true, message: block ? 'User blocked' : 'User unblocked' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────
// ADMIN — DELETE USER
// ─────────────────────────────────────────
router.post('/admin/delete-user', async (req, res) => {
  const { key, userId, email } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db    = await getDB();
    const users = db.collection('users');
    let result;
    if (userId) {
      try { result = await users.deleteOne({ _id: new ObjectId(userId) }); } catch (_) {}
      if (!result || result.deletedCount === 0)
        result = await users.deleteOne({ $or: [{ id: userId }, { userId }] });
    }
    if ((!result || result.deletedCount === 0) && email)
      result = await users.deleteOne({ email: email.toLowerCase() });
    if (result && result.deletedCount > 0)
      res.json({ success: true, message: 'User deleted' });
    else
      res.status(404).json({ success: false, error: 'User not found' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;