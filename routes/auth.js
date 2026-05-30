const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { MongoClient } = require('mongodb');

const JWT_SECRET = process.env.JWT_SECRET || 'raastkar_jwt_secret_2024';
const GOOGLE_WEB_CLIENT_ID = '19973026281-oirm7cc6nki1e5pqasj3hfnu8rb2n86b.apps.googleusercontent.com';
const GOOGLE_ANDROID_CLIENT_ID = '19973026281-bc4tt7m8qpi2olhogv6vuohmseja5qg1.apps.googleusercontent.com';
const MONGODB_URI = process.env.MONGODB_URI;

const googleClient = new OAuth2Client();

let db = null;
async function getDB() {
  if (db) return db;
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db('raastkar');
  return db;
}

function buildUserResponse(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    country: user.country,
    credits: user.credits || 10,
    credits_used: user.credits_used || 0,
    plan: user.plan || 'Free Trial',
    picture: user.picture || '',
    is_google: user.is_google || false,
  };
}

// ── Register ──
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, country, idType, idNumber, idImage } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, error: 'Email, password and name are required' });
    }
    const database = await getDB();
    const users = database.collection('users');
    const existing = await users.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const newUser = {
      id: userId,
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      country: country || 'PK',
      credits: 10,
      credits_used: 0,
      plan: 'Free Trial',
      joined_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      is_google: false,
      free_credits_given: true,
      // Government ID
      id_type: idType || '',
      id_number: idNumber || '',
      id_image: idImage || '',
      id_verified: false,
    };
    await users.insertOne(newUser);
    const token = jwt.sign({ userId, email: email.toLowerCase() }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, message: 'Account created! 10 free credits added.', token, user: buildUserResponse(newUser) });
  } catch (e) {
    console.error('Register error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Login ──
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }
    const database = await getDB();
    const users = database.collection('users');
    const user = await users.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Email not found' });
    }
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Wrong password' });
    }
    await users.updateOne({ id: user.id }, { $set: { last_login: new Date().toISOString() } });
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: buildUserResponse(user) });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Google Login ──
router.post('/google', async (req, res) => {
  try {
    const { idToken, accessToken, email, name, picture, country, isWeb } = req.body;
    const database = await getDB();
    const users = database.collection('users');
    let googleEmail = email;
    let googleName = name;
    let googlePicture = picture;

    if (idToken) {
      try {
        const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_WEB_CLIENT_ID });
        const payload = ticket.getPayload();
        googleEmail = payload.email;
        googleName = payload.name;
        googlePicture = payload.picture;
      } catch (e1) {
        try {
          const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_ANDROID_CLIENT_ID });
          const payload = ticket.getPayload();
          googleEmail = payload.email;
          googleName = payload.name;
          googlePicture = payload.picture;
        } catch (e2) {
          if (!email) {
            return res.status(400).json({ success: false, error: 'Google authentication failed' });
          }
        }
      }
    }

    if (!googleEmail) {
      return res.status(400).json({ success: false, error: 'Could not get email from Google' });
    }

    let user = await users.findOne({ email: googleEmail.toLowerCase() });
    const isNewUser = !user;

    if (!user) {
      const userId = uuidv4();
      user = {
        id: userId,
        email: googleEmail.toLowerCase(),
        password: '',
        name: googleName || googleEmail.split('@')[0],
        country: country || 'PK',
        credits: 10,
        credits_used: 0,
        plan: 'Free Trial',
        joined_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
        is_google: true,
        picture: googlePicture || '',
        free_credits_given: true,
      };
      await users.insertOne(user);
    } else {
      await users.updateOne({ id: user.id }, { $set: { last_login: new Date().toISOString(), picture: googlePicture || user.picture || '' } });
      user = await users.findOne({ email: googleEmail.toLowerCase() });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, isNewUser, user: buildUserResponse(user) });
  } catch (e) {
    console.error('Google login error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── USE CREDIT — deduct from backend ──
router.post('/use-credit', authenticateToken, async (req, res) => {
  try {
    const { amount = 1 } = req.body;
    const database = await getDB();
    const users = database.collection('users');
    const user = await users.findOne({ id: req.userId });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const remaining = (user.credits || 0) - (user.credits_used || 0);
    if (remaining < amount) {
      return res.status(400).json({ success: false, error: 'Not enough credits' });
    }

    await users.updateOne(
      { id: req.userId },
      { $inc: { credits_used: amount } }
    );

    const updated = await users.findOne({ id: req.userId });
    console.log(`✅ Credits used: ${amount} by ${user.email} — remaining: ${updated.credits - updated.credits_used}`);

    res.json({
      success: true,
      credits: updated.credits,
      credits_used: updated.credits_used,
      remaining: updated.credits - updated.credits_used,
    });
  } catch (e) {
    console.error('use-credit error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Get Profile ──
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const database = await getDB();
    const users = database.collection('users');
    const user = await users.findOne({ id: req.userId });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({
      success: true,
      user: {
        ...buildUserResponse(user),
        phone: user.phone || '',
        farmLocation: user.farmLocation || '',
        credits_total: user.credits || 10,
        joined_at: user.joined_at,
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Update Profile ──
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const database = await getDB();
    const users = database.collection('users');
    const { name, country, phone, farmLocation } = req.body;
    await users.updateOne({ id: req.userId }, { $set: { name, country, phone, farmLocation } });
    const user = await users.findOne({ id: req.userId });
    res.json({ success: true, user: buildUserResponse(user) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Change Password ──
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const database = await getDB();
    const users = database.collection('users');
    const { currentPassword, newPassword } = req.body;
    const user = await users.findOne({ id: req.userId });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (user.is_google) return res.status(400).json({ success: false, error: 'Google accounts cannot change password' });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ success: false, error: 'Current password is wrong' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await users.updateOne({ id: req.userId }, { $set: { password: hashed } });
    res.json({ success: true, message: 'Password changed!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Admin - Get All Users ──
router.get('/admin/users', async (req, res) => {
  if (req.query.key !== 'raastkar_admin_2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const database = await getDB();
    const users = database.collection('users');
    const allUsers = await users.find({}).toArray();
    res.json({
      success: true,
      total: allUsers.length,
      users: allUsers.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        country: u.country,
        credits: u.credits || 0,
        credits_used: u.credits_used || 0,
        credits_remaining: (u.credits || 0) - (u.credits_used || 0),
        plan: u.plan,
        joined_at: u.joined_at,
        last_login: u.last_login,
        is_google: u.is_google || false,
        id_type: u.id_type || '',
        id_number: u.id_number || '',
        id_image: u.id_image || '',
        id_verified: u.id_verified || false,
      }))
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Admin - Add Credits ──
router.post('/admin/add-credits', async (req, res) => {
  const { key, email, credits } = req.body;
  if (key !== 'raastkar_admin_2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const database = await getDB();
    const users = database.collection('users');
    const user = await users.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await users.updateOne({ email: email.toLowerCase() }, { $inc: { credits: parseInt(credits) } });
    res.json({ success: true, message: `${credits} credits added to ${email}` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Auth Middleware ──
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (e) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// ── Admin - Verify User ID ──
router.post('/admin/verify-id', async (req, res) => {
  const { key, userId, verified } = req.body;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const database = await getDB();
    const users = database.collection('users');
    await users.updateOne({ id: userId }, { $set: { id_verified: verified } });
    res.json({ success: true, message: verified ? 'ID verified!' : 'ID unverified' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Admin - Block / Unblock User ──
router.post('/admin/block-user', async (req, res) => {
  const { key, userId, block } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const database = await getDB();
    const users = database.collection('users');
    await users.updateOne({ id: userId }, { $set: { is_blocked: block === true } });
    res.json({ success: true, message: block ? 'User blocked' : 'User unblocked' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Admin - Delete User ──
router.post('/admin/delete-user', async (req, res) => {
  const { key, userId, email } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const database = await getDB();
    const users = database.collection('users');
    let result;
    if (userId) {
      result = await users.deleteOne({ id: userId });
    } else if (email) {
      result = await users.deleteOne({ email: email.toLowerCase() });
    }
    if (result && result.deletedCount > 0) {
      res.json({ success: true, message: 'User deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'User not found' });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;