require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const imageRoutes = require('./routes/images');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./config/logger');
const db = require('./config/database');

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Security & utility middleware ────────────────────────────────────────────

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Rate limiting ────────────────────────────────────────────────────────────

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, error: 'Too many upload requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', async (req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

app.use('/api/images', uploadLimiter, imageRoutes);

// 404 catch-all
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found.` });
});

// Central error handler (must be last)
app.use(errorHandler);

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function start() {
  try {
    // Verify DB connection
    await db.raw('SELECT 1');
    logger.info('Database connection established.');

    // Run pending migrations automatically on startup
    await db.migrate.latest();
    logger.info('Database migrations up to date.');

    app.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Don't touch the real DB / bind a port when the app is required by tests —
// tests import `app` for supertest and mock out the DB-touching modules.
if (process.env.NODE_ENV !== 'test') {
  start();
}

module.exports = app; // for testing
