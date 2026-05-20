const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'raastkar_jwt_secret_2024';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// In-memory storage (use MongoDB in production)
let users = [];
let sessions = [];

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, country } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password and name are required'
      });
    }

    // Check if user exists
    const existing = users.find(u => u.email === email.toLowerCase());
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
      credits: 10, // Free 10 credits on signup
      credits_used: 0,
      plan: 'Free Trial',
      joined_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      is_google: false,
      free_credits_given: true,
    };

    users.push(newUser);

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
        free_credits_given: true,
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password required'
      });
    }

    const user = users.find(u => u.email === email.toLowerCase());
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

    user.last_login = new Date().toISOString();

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
    res.status(500).json({ success: false, error: e.message });
  }
});

// Google Login
router.post('/google', async (req, res) => {
  try {
    const { idToken, country } = req.body;

    let googleUser;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_ID,
      });
      googleUser = ticket.getPayload();
    } catch (e) {
      // For testing without real Google client ID
      googleUser = {
        sub: 'google_' + Date.now(),
        email: req.body.email || 'test@gmail.com',
        name: req.body.name || 'Google User',
        picture: req.body.picture || '',
      };
    }

    let user = users.find(u => u.email === googleUser.email.toLowerCase());

    if (!user) {
      // New user - give 10 free credits
      const userId = uuidv4();
      user = {
        id: userId,
        email: googleUser.email.toLowerCase(),
        password: '',
        name: googleUser.name,
        country: country || 'PK',
        credits: 10,
        credits_used: 0,
        plan: 'Free Trial',
        joined_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
        is_google: true,
        google_id: googleUser.sub,
        picture: googleUser.picture || '',
        free_credits_given: true,
      };
      users.push(user);
    } else {
      user.last_login = new Date().toISOString();
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      isNewUser: user.free_credits_given && user.credits === 10,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        country: user.country,
        credits: user.credits - user.credits_used,
        plan: user.plan,
        picture: user.picture || '',
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get user profile
router.get('/profile', authenticateToken, (req, res) => {
  const user = users.find(u => u.id === req.userId);
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
      credits: user.credits - user.credits_used,
      credits_total: user.credits,
      credits_used: user.credits_used,
      plan: user.plan,
      joined_at: user.joined_at,
      picture: user.picture || '',
    }
  });
});

// Update profile
router.put('/profile', authenticateToken, (req, res) => {
  const user = users.find(u => u.id === req.userId);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  const { name, country } = req.body;
  if (name) user.name = name;
  if (country) user.country = country;
  res.json({ success: true, user });
});

// Add credits to user (called after payment approval)
router.post('/add-credits', authenticateToken, (req, res) => {
  const { credits } = req.body;
  const user = users.find(u => u.id === req.userId);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  user.credits += parseInt(credits);
  res.json({
    success: true,
    credits: user.credits - user.credits_used,
    message: `${credits} credits added!`
  });
});

// Use credits
router.post('/use-credit', authenticateToken, (req, res) => {
  const { amount, feature } = req.body;
  const user = users.find(u => u.id === req.userId);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  const remaining = user.credits - user.credits_used;
  if (remaining < (amount || 1)) {
    return res.status(400).json({
      success: false,
      error: 'Not enough credits',
      remaining
    });
  }
  user.credits_used += (amount || 1);
  res.json({
    success: true,
    remaining: user.credits - user.credits_used
  });
});

// Admin - get all users
router.get('/admin/users', (req, res) => {
  if (req.query.key !== 'raastkar_admin_2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({
    success: true,
    total: users.length,
    users: users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      country: u.country,
      credits: u.credits - u.credits_used,
      plan: u.plan,
      joined_at: u.joined_at,
      last_login: u.last_login,
    }))
  });
});

// Middleware to authenticate token
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
module.exports.users = users;