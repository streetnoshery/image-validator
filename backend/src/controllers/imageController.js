const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Image = require('../models/Image');
const { validateAndProcess } = require('../services/imageProcessingService');
const { uploadFile, deleteFile, buildPublicUrl } = require('../services/storageService');
const logger = require('../config/logger');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determine MIME type from a buffer's magic bytes (fallback to declared type).
 * Handles HEIC/HEIF whose MIME is often misreported as application/octet-stream.
 * @param {Buffer} buf
 * @param {string} declaredMime
 * @returns {string}
 */
function detectMimeType(buf, declaredMime) {
  // HEIC/HEIF: ftyp box at offset 4, brands: heic, hei, mif1, msf1
  if (buf.length > 11) {
    const brand = buf.slice(8, 12).toString('ascii');
    if (['heic', 'heis', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'hevm', 'hevs'].some((b) => brand.startsWith(b))) {
      return 'image/heic';
    }
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';

  return declaredMime;
}

/**
 * Build the S3 key for a stored image.
 * @param {string} status - 'accepted' | 'rejected'
 * @param {string} filename
 * @returns {string}
 */
function buildS3Key(status, filename) {
  const folder = status === 'accepted' ? 'accepted' : 'rejected';
  return `images/${folder}/${filename}`;
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /api/images/upload
 * Accepts one or more images, runs validation pipeline, stores results.
 */
async function uploadImages(req, res) {
  const files = req.files;
  if (!files || files.length === 0) {
    return res.status(400).json({ success: false, error: 'No files uploaded.' });
  }

  // Fetch existing hashes ONCE for similarity comparison across entire batch
  const existingPhashes = await Image.getAllPhashes();

  const results = [];

  for (const file of files) {
    const fileId = uuidv4();
    const originalName = path.basename(file.originalname);
    let dbRecord = null;

    try {
      // Detect actual MIME (handles HEIC misreported as octet-stream)
      const mimeType = detectMimeType(file.buffer, file.mimetype);

      logger.info(`Processing: ${originalName} (${mimeType}, ${file.size} bytes)`);

      // ── Create an initial DB record with "processing" status ────────────
      dbRecord = await Image.create({
        id: fileId,
        original_filename: originalName,
        stored_filename: fileId,
        s3_key: 'pending',
        s3_url: 'pending',
        mime_type: mimeType,
        file_size: file.size,
        status: 'processing',
      });

      // ── Run validation + processing ──────────────────────────────────────
      const validationResult = await validateAndProcess(
        file.buffer,
        mimeType,
        file.size,
        existingPhashes
      );

      const {
        accepted,
        rejectionReasons,
        processedBuffer,
        processedMime,
        extension,
        width,
        height,
        blurScore,
        faceCount,
        phash,
        metadata,
      } = validationResult;

      const status = accepted ? 'accepted' : 'rejected';
      const storedFilename = `${fileId}.${extension}`;
      const s3Key = buildS3Key(status, storedFilename);

      // ── Upload (processed/converted) buffer to MinIO ────────────────────
      const s3Url = await uploadFile(processedBuffer, s3Key, processedMime, {
        originalName,
        status,
      });

      // ── Update DB record ─────────────────────────────────────────────────
      const updated = await Image.update(fileId, {
        stored_filename: storedFilename,
        s3_key: s3Key,
        s3_url: s3Url,
        mime_type: processedMime,
        width,
        height,
        status,
        rejection_reasons: rejectionReasons.length ? rejectionReasons : null,
        phash,
        blur_score: blurScore,
        face_count: faceCount,
        metadata,
      });

      // Add newly accepted hashes so subsequent files in THIS batch also check against it
      if (accepted && phash) {
        existingPhashes.push({ id: fileId, phash });
      }

      results.push({
        id: updated.id,
        originalFilename: originalName,
        status,
        rejectionReasons,
        previewUrl: s3Url,
        width,
        height,
        mimeType: processedMime,
        fileSize: file.size,
        blurScore,
        faceCount,
      });

      logger.info(`${originalName} → ${status}${rejectionReasons.length ? ` (${rejectionReasons.join('; ')})` : ''}`);
    } catch (err) {
      logger.error(`Failed to process ${originalName}:`, err);

      // Mark as rejected with error if DB record was created
      if (dbRecord) {
        await Image.update(fileId, {
          status: 'rejected',
          rejection_reasons: [`Processing error: ${err.message}`],
        }).catch(() => {});
      }

      results.push({
        id: fileId,
        originalFilename: originalName,
        status: 'rejected',
        rejectionReasons: [`Processing error: ${err.message}`],
        error: true,
      });
    }
  }

  const accepted = results.filter((r) => r.status === 'accepted');
  const rejected = results.filter((r) => r.status === 'rejected');

  res.status(200).json({
    success: true,
    summary: { total: results.length, accepted: accepted.length, rejected: rejected.length },
    results,
  });
}

/**
 * GET /api/images
 * List images with optional status filter and pagination.
 */
async function listImages(req, res) {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const images = await Image.findAll({
    status: status || undefined,
    limit: parseInt(limit),
    offset,
  });

  const stats = await Image.countByStatus();
  const statsMap = stats.reduce((acc, { status: s, count }) => {
    acc[s] = parseInt(count);
    return acc;
  }, {});

  res.json({
    success: true,
    images,
    pagination: { page: parseInt(page), limit: parseInt(limit) },
    stats: statsMap,
  });
}

/**
 * GET /api/images/:id
 * Fetch a single image by ID, with a fresh pre-signed URL.
 */
async function getImage(req, res) {
  const { id } = req.params;
  const image = await Image.findById(id);

  if (!image) {
    return res.status(404).json({ success: false, error: 'Image not found.' });
  }

  // Return public MinIO URL directly (bucket is public read)
  let presignedUrl = image.s3_url;
  if (image.s3_key && image.s3_key !== 'pending') {
    presignedUrl = buildPublicUrl(image.s3_key);
  }

  res.json({ success: true, image: { ...image, previewUrl: presignedUrl } });
}

/**
 * DELETE /api/images/:id
 * Remove image from S3 and database.
 */
async function deleteImage(req, res) {
  const { id } = req.params;
  const image = await Image.findById(id);

  if (!image) {
    return res.status(404).json({ success: false, error: 'Image not found.' });
  }

  if (image.s3_key && image.s3_key !== 'pending') {
    await deleteFile(image.s3_key);
  }
  await Image.delete(id);

  res.json({ success: true, message: 'Image deleted.' });
}

/**
 * GET /api/images/stats
 * Return upload statistics.
 */
async function getStats(req, res) {
  const stats = await Image.countByStatus();
  const statsMap = stats.reduce((acc, { status, count }) => {
    acc[status] = parseInt(count);
    return acc;
  }, {});

  res.json({ success: true, stats: statsMap });
}

module.exports = { uploadImages, listImages, getImage, deleteImage, getStats };
