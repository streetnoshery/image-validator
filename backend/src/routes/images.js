const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const requireFaceModels = require('../middleware/requireFaceModels');
const requireAuth = require('../middleware/requireAuth');
const {
  uploadImages,
  getBatchStatus,
  listImages,
  getImage,
  deleteImage,
  getStats,
  claimOrphaned,
} = require('../controllers/imageController');

// Every route in this file is private to the authenticated caller —
// applied once here rather than per-route so a new route can't be added
// later and accidentally left open.
router.use(requireAuth);

/**
 * POST /api/images/upload
 * Upload one or more images (multipart/form-data, field name: "images").
 * Queues them for background processing and returns 202 immediately —
 * poll GET /api/images/batch?ids= for results.
 */
router.post('/upload', requireFaceModels, upload.array('images', 10), uploadImages);

/**
 * GET /api/images/stats
 * Aggregated upload statistics for the authenticated user.
 */
router.get('/stats', getStats);

/**
 * GET /api/images/batch?ids=a,b,c
 * Poll processing status for a batch of images.
 */
router.get('/batch', getBatchStatus);

/**
 * POST /api/images/claim
 * Adopt any images left ownerless from before auth existed.
 */
router.post('/claim', claimOrphaned);

/**
 * GET /api/images
 * List images. Query params: status, page, limit.
 */
router.get('/', listImages);

/**
 * GET /api/images/:id
 * Get a single image by ID.
 */
router.get('/:id', getImage);

/**
 * DELETE /api/images/:id
 * Delete an image.
 */
router.delete('/:id', deleteImage);

module.exports = router;
