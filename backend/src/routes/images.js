const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const {
  uploadImages,
  listImages,
  getImage,
  deleteImage,
  getStats,
} = require('../controllers/imageController');

/**
 * POST /api/images/upload
 * Upload one or more images (multipart/form-data, field name: "images").
 */
router.post('/upload', upload.array('images', 10), uploadImages);

/**
 * GET /api/images/stats
 * Aggregated upload statistics.
 */
router.get('/stats', getStats);

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
