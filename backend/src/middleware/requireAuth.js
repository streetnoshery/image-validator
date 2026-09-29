const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/auth');

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches
 * `req.user = { id, email }`. Every /api/images route requires this —
 * uploads, listing, and storage access are all scoped to req.user.id.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session.' });
  }
}

module.exports = requireAuth;
