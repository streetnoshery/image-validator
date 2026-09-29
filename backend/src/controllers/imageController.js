const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Image = require('../models/Image');
const { analyzeImage, checkSimilarity } = require('../services/imageProcessingService');
const { uploadFile, deleteFile, getPresignedUrl } = require('../services/storageService');
const uploadQueue = require('../services/uploadQueue');
const Mutex = require('../utils/Mutex');
const logger = require('../config/logger');

// Serializes the "check perceptual hash against known hashes, then
// register it" critical section across ALL concurrently-processed jobs
// (not just within one batch) — without this, two similar images queued
// at the same time could both pass the duplicate check before either one
// registers its hash. One mutex for the whole process is fine even
// across users: it only ever compares a job against its OWN user's
// hash list (see Image.getAllPhashes), so it's not a cross-user
// bottleneck in practice, just a tiny serialized critical section.
const similarityMutex = new Mutex();

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
 * Build the S3 key for a stored image, namespaced under the owning user
 * so objects are organized per-account even though the bucket itself
 * has no public policy to rely on for isolation.
 * @param {string} userId
 * @param {string} status - 'accepted' | 'rejected'
 * @param {string} filename
 * @returns {string}
 */
function buildS3Key(userId, status, filename) {
  const folder = status === 'accepted' ? 'accepted' : 'rejected';
  return `images/${userId}/${folder}/${filename}`;
}

/**
 * Replace a row's `s3_url` with a freshly-minted short-lived signed URL
 * (the bucket is private — nothing is servable without one). Applied at
 * the response layer, not persisted, so a leaked API response can't
 * grant standing access.
 */
async function withPresignedUrl(image) {
  if (!image.s3_key || image.s3_key === 'pending') return image;
  return { ...image, s3_url: await getPresignedUrl(image.s3_key) };
}

/**
 * Run the full validation + storage pipeline for one queued file, then
 * persist the result. Runs on the background queue (see uploadQueue.js) —
 * errors are caught here so one bad file can't take down the worker or
 * leave its DB row stuck at "queued".
 * @param {{
 *   fileId: string, userId: string, buffer: Buffer, mimeType: string,
 *   fileSize: number, originalName: string,
 *   sharedPhashes: Array<{id: string, phash: string}>
 * }} job
 */
async function processQueuedFile({ fileId, userId, buffer, mimeType, fileSize, originalName, sharedPhashes }) {
  try {
    const analysis = await analyzeImage(buffer, mimeType, fileSize);
    const rejectionReasons = [...analysis.rejectionReasons];

    const release = await similarityMutex.lock();
    try {
      if (analysis.phash) {
        const { isSimilar, matchId, distance } = checkSimilarity(analysis.phash, sharedPhashes);
        if (isSimilar) {
          rejectionReasons.push(
            `Too similar to an existing image (id: ${matchId}, distance: ${distance})`
          );
        } else if (rejectionReasons.length === 0) {
          // Only register hashes for images that end up accepted — matches
          // Image.getAllPhashes(), which excludes rejected images too.
          sharedPhashes.push({ id: fileId, phash: analysis.phash });
        }
      }
    } finally {
      release();
    }

    const status = rejectionReasons.length === 0 ? 'accepted' : 'rejected';
    const storedFilename = `${fileId}.${analysis.extension}`;
    const s3Key = buildS3Key(userId, status, storedFilename);

    await uploadFile(analysis.processedBuffer, s3Key, analysis.processedMime, {
      originalName,
      status,
      userId,
    });

    const updated = await Image.update(fileId, userId, {
      stored_filename: storedFilename,
      s3_key: s3Key,
      s3_url: s3Key, // placeholder — real URLs are signed fresh per-read, see withPresignedUrl()
      mime_type: analysis.processedMime,
      width: analysis.width,
      height: analysis.height,
      status,
      rejection_reasons: rejectionReasons.length ? rejectionReasons : null,
      phash: analysis.phash,
      blur_score: analysis.blurScore,
      face_count: analysis.faceCount,
      metadata: analysis.metadata,
    });

    logger.info(
      `${originalName} -> ${status}${rejectionReasons.length ? ` (${rejectionReasons.join('; ')})` : ''}`
    );
    return updated;
  } catch (err) {
    logger.error(`Failed to process ${originalName}: ${err.message}`);
    await Image.update(fileId, userId, {
      status: 'rejected',
      rejection_reasons: [`Processing error: ${err.message}`],
    }).catch((updateErr) => {
      logger.error(`Also failed to mark ${fileId} as rejected: ${updateErr.message}`);
    });
  }
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /api/images/upload
 * Accepts one or more images, records them immediately under the
 * authenticated user, and hands validation/storage off to the
 * background queue — the response does NOT wait for processing to
 * finish. Poll GET /api/images/batch?ids= (or GET /api/images/:id) for
 * results.
 */
async function uploadImages(req, res) {
  const files = req.files;
  if (!files || files.length === 0) {
    return res.status(400).json({ success: false, error: 'No files uploaded.' });
  }

  const userId = req.user.id;

  // Seed with this user's existing accepted-image hashes ONCE; jobs
  // mutate this same array (under similarityMutex) as they complete, so
  // later files in the batch — and other concurrent requests from this
  // same user — see each other. Never includes other users' hashes.
  const sharedPhashes = await Image.getAllPhashes(userId);

  const queued = [];

  for (const file of files) {
    const fileId = uuidv4();
    const originalName = path.basename(file.originalname);
    const mimeType = detectMimeType(file.buffer, file.mimetype);

    try {
      await Image.create({
        id: fileId,
        user_id: userId,
        original_filename: originalName,
        stored_filename: fileId,
        s3_key: 'pending',
        s3_url: 'pending',
        mime_type: mimeType,
        file_size: file.size,
        status: 'queued',
      });
    } catch (err) {
      logger.error(`Failed to record ${originalName}: ${err.message}`);
      queued.push({
        id: fileId,
        originalFilename: originalName,
        status: 'rejected',
        rejectionReasons: [`Failed to record upload: ${err.message}`],
        fileSize: file.size,
        mimeType,
      });
      continue;
    }

    uploadQueue
      .add(() =>
        processQueuedFile({
          fileId,
          userId,
          buffer: file.buffer,
          mimeType,
          fileSize: file.size,
          originalName,
          sharedPhashes,
        })
      )
      .catch((err) => logger.error(`Queue job crashed for ${originalName}: ${err.message}`));

    queued.push({
      id: fileId,
      originalFilename: originalName,
      status: 'queued',
      fileSize: file.size,
      mimeType,
    });

    logger.info(`Queued: ${originalName} (${mimeType}, ${file.size} bytes) for user ${userId}`);
  }

  res.status(202).json({
    success: true,
    message: 'Files queued for processing.',
    queued,
  });
}

/**
 * GET /api/images/batch?ids=a,b,c
 * Poll processing status for a batch of images owned by the
 * authenticated user — ids for other users' images are silently
 * dropped rather than 404ing individually, so a guessed id can't be
 * used to probe for existence.
 */
async function getBatchStatus(req, res) {
  const idsParam = req.query.ids;
  if (!idsParam) {
    return res.status(400).json({ success: false, error: 'ids query parameter is required.' });
  }

  const ids = idsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);

  const images = await Image.findByIds(ids, req.user.id);
  const withUrls = await Promise.all(images.map(withPresignedUrl));
  res.json({ success: true, images: withUrls });
}

/**
 * GET /api/images
 * List the authenticated user's own images, with optional status filter
 * and pagination.
 */
async function listImages(req, res) {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const userId = req.user.id;

  const images = await Image.findAll(userId, {
    status: status || undefined,
    limit: parseInt(limit),
    offset,
  });
  const withUrls = await Promise.all(images.map(withPresignedUrl));

  const stats = await Image.countByStatus(userId);
  const statsMap = stats.reduce((acc, { status: s, count }) => {
    acc[s] = parseInt(count);
    return acc;
  }, {});

  res.json({
    success: true,
    images: withUrls,
    pagination: { page: parseInt(page), limit: parseInt(limit) },
    stats: statsMap,
  });
}

/**
 * GET /api/images/:id
 * Fetch a single image by ID (must be owned by the authenticated user),
 * with a fresh signed URL.
 */
async function getImage(req, res) {
  const { id } = req.params;
  const image = await Image.findById(id, req.user.id);

  if (!image) {
    return res.status(404).json({ success: false, error: 'Image not found.' });
  }

  const withUrl = await withPresignedUrl(image);
  res.json({ success: true, image: { ...withUrl, previewUrl: withUrl.s3_url } });
}

/**
 * DELETE /api/images/:id
 * Remove an image (must be owned by the authenticated user) from
 * storage and the database.
 */
async function deleteImage(req, res) {
  const { id } = req.params;
  const image = await Image.findById(id, req.user.id);

  if (!image) {
    return res.status(404).json({ success: false, error: 'Image not found.' });
  }

  if (image.s3_key && image.s3_key !== 'pending') {
    await deleteFile(image.s3_key);
  }
  await Image.delete(id, req.user.id);

  res.json({ success: true, message: 'Image deleted.' });
}

/**
 * GET /api/images/stats
 * Return the authenticated user's own upload statistics.
 */
async function getStats(req, res) {
  const stats = await Image.countByStatus(req.user.id);
  const statsMap = stats.reduce((acc, { status, count }) => {
    acc[status] = parseInt(count);
    return acc;
  }, {});

  res.json({ success: true, stats: statsMap });
}

/**
 * POST /api/images/claim
 * One-time convenience: adopt any images left ownerless by rows created
 * before authentication existed. Idempotent — a row can only be claimed
 * once, by whichever authenticated user calls this first.
 */
async function claimOrphaned(req, res) {
  const claimed = await Image.claimOrphaned(req.user.id);
  res.json({ success: true, claimed });
}

module.exports = {
  uploadImages,
  getBatchStatus,
  listImages,
  getImage,
  deleteImage,
  getStats,
  claimOrphaned,
};
