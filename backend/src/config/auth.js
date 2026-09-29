const crypto = require('crypto');
const logger = require('./logger');

let secret = process.env.JWT_SECRET;

if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production — refusing to start with no secret.');
  }
  // Dev convenience only: stable secrets aren't needed for local iteration,
  // but this DOES mean existing tokens are invalidated on every restart.
  secret = crypto.randomBytes(32).toString('hex');
  logger.warn(
    'JWT_SECRET not set — using an ephemeral development secret (logins will not survive a server restart). Set JWT_SECRET in backend/.env for stable sessions.'
  );
}

module.exports = {
  JWT_SECRET: secret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  BCRYPT_ROUNDS: 10,
};
