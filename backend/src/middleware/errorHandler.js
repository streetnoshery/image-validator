const logger = require('../config/logger');
const multer = require('multer');

/**
 * Central error handler. Must be registered last (after all routes).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Multer-specific errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 20} MB.`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files. Maximum 10 files per request.',
      });
    }
    return res.status(400).json({ success: false, error: err.message });
  }

  // Custom file-type rejection
  if (err.code === 'UNSUPPORTED_FILE_TYPE') {
    return res.status(400).json({ success: false, error: err.message });
  }

  // Validation errors (express-validator)
  if (err.type === 'validation') {
    return res.status(422).json({ success: false, errors: err.errors });
  }

  // Default 500
  logger.error('Unhandled error:', err);
  const message =
    process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  res.status(err.status || 500).json({ success: false, error: message });
}

module.exports = errorHandler;
