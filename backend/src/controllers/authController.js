const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET, JWT_EXPIRES_IN, BCRYPT_ROUNDS } = require('../config/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * POST /api/auth/register
 */
async function register(req, res) {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ success: false, error: 'A valid email is required.' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
  }

  const existing = await User.findByEmailWithPassword(email);
  if (existing) {
    return res.status(409).json({ success: false, error: 'An account with that email already exists.' });
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({ email, password_hash });
  const token = signToken(user);

  res.status(201).json({ success: true, token, user: { id: user.id, email: user.email } });
}

/**
 * POST /api/auth/login
 */
async function login(req, res) {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  const user = await User.findByEmailWithPassword(email);
  // Same generic error whether the account doesn't exist or the password
  // is wrong — don't let login responses reveal which emails are registered.
  const genericError = () =>
    res.status(401).json({ success: false, error: 'Invalid email or password.' });

  if (!user) return genericError();

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return genericError();

  const token = signToken(user);
  res.json({ success: true, token, user: { id: user.id, email: user.email } });
}

/**
 * GET /api/auth/me
 */
async function me(req, res) {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Account no longer exists.' });
  }
  res.json({ success: true, user });
}

module.exports = { register, login, me };
