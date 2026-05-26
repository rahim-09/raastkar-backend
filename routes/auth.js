const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { MongoClient } = require('mongodb');

const JWT_SECRET = process.env.JWT_SECRET || 'raastkar_jwt_secret_2024';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_WEB_CLIENT_ID = '19973026281-oirm7cc6nki1e5pqasj3hfnu8rb2n86b.apps.googleusercontent.com';
const GOOGLE_ANDROID_CLIENT_ID = '19973026281-bc4tt7m8qpi2olhogv6vuohmseja5qg1.apps.googleusercontent.com';
const MONGODB_URI = process.env.MONGODB_URI;

const googleClient = new OAuth2Client();

// MongoDB connection
let db = null;
async function getDB() {
  if (db) return db;
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db('raastkar');
  console.log('✅ Connected to MongoDB');
  return db;
}

// ── Register ──
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, country } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password and name are required'
      });
    }

    const database = await getDB();
    const users = database.collection('users');

    const existing = await users.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
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
    };

    await users.insertOne(newUser);

    const token = jwt.sign(
      { userId, email: email.toLowerCase() },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Account created! 10 free credits added.',
      token,
      user: {
        id: userId,
        email: newUser.email,
        name: newUser.name,
        country: newUser.country,
        credits: newUser.credits,
        plan: newUser.plan,
      }
    });
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
      return res.status(400).json({
        success: false,
        error: 'Email and password required'
      });
    }

    const database = await getDB();
    const users = database.collection('users');

    const user = await users.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Email not found'
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Wrong password'
      });
    }

    await users.updateOne(
      { id: user.id },
      { $set: { last_login: new Date().toISOString() } }
    );

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        country: user.country,
        credits: user.credits - user.credits_used,
        plan: user.plan,
      }
    });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Google Login ── works for both web and mobile ──
router.post('/google', async (req, res) => {
  try {
    const { idToken, accessToken, email, name, picture, country, isWeb } = req.body;

    console.log('Google login attempt:', { email, isWeb, hasIdToken: !!idToken, hasAccessToken: !!accessToken });

    const database = await getDB();
    const users = database.collection('users');

    let googleEmail = email;
    let googleName = name;
    let googlePicture = picture;

    // Try to verify token — support both web and mobile client IDs
    if (idToken) {
      try {
        // Try web client ID first
        try {
          const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: GOOGLE_WEB_CLIENT_ID,
          });
          const payload = ticket.getPayload();
          googleEmail = payload.email;
          googleName = payload.name;
          googlePicture = payload.picture;
          console.log('✅ Verified with web client ID');
        } catch (webErr) {
          // Try android client ID
          try {
            const ticket = await googleClient.verifyIdToken({
              idToken,
              audience: GOOGLE_ANDROID_CLIENT_ID,
            });
            const payload = ticket.getPayload();
            googleEmail = payload.email;
            googleName = payload.name;
            googlePicture = payload.picture;
            console.log('✅ Verified with android client ID');
          } catch (androidErr) {
            // Try with env client ID
            try {
              const ticket = await googleClient.verifyIdToken({
                idToken,
                audience: GOOGLE_CLIENT_ID,
              });
              const payload = ticket.getPayload();
              googleEmail = payload.email;
              googleName = payload.name;
              googlePicture = payload.picture;
              console.log('✅ Verified with env client ID');
            } catch (envErr) {
              // Token verification failed — use provided email
              console.log('⚠️ Token verification failed, using provided email:', email);
              if (!email) {
                return res.status(400).json({
                  success: false,
                  error: 'Google authentication failed — no valid token or email'
                });
              }
            }
          }
        }
      } catch (e) {
        console.log('Token verification error:', e.message);
        if (!email) {
          return res.status(400).json({
            success: false,
            error: 'Google authentication failed'
          });
        }
      }
    } else if (accessToken && email) {
      // Web sometimes only sends accessToken — use provided email
      console.log('Using accessToken flow with email:', email);
      googleEmail = email;
      googleName = name;
      googlePicture = picture;
    } else if (email) {
      // Fallback — just use email
      console.log('Using email only flow:', email);
      googleEmail = email;
      googleName = name;
      googlePicture = picture;
    } else {
      return res.status(400).json({
        success: false,
        error: 'No valid credentials provided'
      });
    }

    if (!googleEmail) {
      return res.status(400).json({
        success: false,
        error: 'Could not get email from Google'
      });
    }

    // Find or create user
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
      console.log('✅ New Google user created:', googleEmail);
    } else {
      await users.updateOne(
        { id: user.id },
        {
          $set: {
            last_login: new Date().toISOString(),
            picture: googlePicture || user.picture || '',
            name: googleName || user.name,
          }
        }
      );
      console.log('✅ Existing Google user logged in:', googleEmail);
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      isNewUser,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        country: user.country,
        credits: user.credits - user.credits_used,
        plan: user.plan,
        picture: user.picture || '',
        is_google: true,
      }
    });
  } catch (e) {
    console.error('Google login error:', e.message);
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
        id: user.id,
        email: user.email,
        name: user.name,
        country: user.country,
        phone: user.phone || '',
        farmLocation: user.farmLocation || '',
        credits: user.credits - user.credits_used,
        credits_total: user.credits,
        credits_used: user.credits_used,
        plan: user.plan,
        joined_at: user.joined_at,
        picture: user.picture || '',
        is_google: user.is_google || false,
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

    await users.updateOne(
      { id: req.userId },
      { $set: { name, country, phone, farmLocation } }
    );

    const user = await users.findOne({ id: req.userId });
    res.json({ success: true, user });
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
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (user.is_google) {
      return res.status(400).json({
        success: false,
        error: 'Google accounts cannot change password'
      });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is wrong'
      });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await users.updateOne(
      { id: req.userId },
      { $set: { password: hashed } }
    );

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
        credits: u.credits - u.credits_used,
        plan: u.plan,
        joined_at: u.joined_at,
        last_login: u.last_login,
        is_google: u.is_google || false,
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

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await users.updateOne(
      { email: email.toLowerCase() },
      { $inc: { credits: parseInt(credits) } }
    );

    res.json({
      success: true,
      message: `${credits} credits added to ${email}`
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Auth Middleware ──
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (e) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

module.exports = router;
module.exports.authenticateToken = authenticateToken;