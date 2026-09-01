const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

// ─── Thresholds ───────────────────────────────────────────────────────────────

const MIN_WIDTH           = 200;
const MIN_HEIGHT          = 200;
const MIN_FILE_SIZE_BYTES = 10 * 1024; // 10 KB
const BLUR_THRESHOLD      = 100;       // Laplacian variance — below = blurry
const SIMILARITY_THRESHOLD = 10;       // Hamming distance   — below = duplicate
const PHASH_SIZE          = 8;         // 8×8 DCT → 64-bit hash
const MIN_FACE_RATIO      = 0.05;      // face bounding box must be ≥5% of image

// ─── face-api.js (local, no cloud) ───────────────────────────────────────────
// Models are downloaded once into backend/models/ (see README).
// If the models folder is missing we skip face detection gracefully.

let faceapi = null;
let faceModelsLoaded = false;

async function loadFaceModels() {
  if (faceModelsLoaded) return true;
  try {
    // canvas must be patched before importing face-api
    const canvasLib = require('canvas');
    faceapi = require('@vladmandic/face-api/dist/face-api.node.js');
    faceapi.env.monkeyPatch({
      Canvas:    canvasLib.Canvas,
      Image:     canvasLib.Image,
      ImageData: canvasLib.ImageData,
    });

    const modelsDir = path.join(__dirname, '../../models');
    if (!fs.existsSync(modelsDir)) {
      logger.warn('face-api models directory not found — face detection disabled. Run: node scripts/download-models.js');
      return false;
    }

    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsDir);
    faceModelsLoaded = true;
    logger.info('Face detection models loaded.');
    return true;
  } catch (err) {
    logger.warn(`Could not load face-api models: ${err.message}`);
    return false;
  }
}

// Kick off model loading at startup (non-blocking)
loadFaceModels().catch(() => {});

// ─── HEIC conversion ──────────────────────────────────────────────────────────

async function normaliseImage(buffer, originalMime) {
  const heicTypes = ['image/heic', 'image/heif'];
  if (heicTypes.includes(originalMime.toLowerCase())) {
    const converted = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
    return { buffer: converted, mimeType: 'image/jpeg', extension: 'jpg' };
  }
  const ext = originalMime === 'image/png' ? 'png' : 'jpg';
  return { buffer, mimeType: originalMime, extension: ext };
}

// ─── Blur detection ───────────────────────────────────────────────────────────

/**
 * Laplacian variance — higher = sharper.
 */
async function calculateBlurScore(buffer) {
  try {
    const { data, info } = await sharp(buffer)
      .resize({ width: 512, withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = info;
    const pixels = new Float32Array(data);
    let sum = 0, sumSq = 0, count = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const lap =
          pixels[i - width] + pixels[i + width] +
          pixels[i - 1]     + pixels[i + 1] -
          4 * pixels[i];
        sum   += lap;
        sumSq += lap * lap;
        count++;
      }
    }

    const mean = sum / count;
    return Math.max(0, sumSq / count - mean * mean);
  } catch (err) {
    logger.warn('Blur calculation failed:', err.message);
    return 0;
  }
}

// ─── Perceptual hash ──────────────────────────────────────────────────────────

async function computePhash(buffer) {
  const size = PHASH_SIZE * 4; // 32×32

  const { data } = await sharp(buffer)
    .resize(size, size, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Array.from(data);
  const N = size;

  // 2-pass 2D DCT (rows then columns)
  const dct = Array.from({ length: N }, () => new Float64Array(N));
  for (let y = 0; y < N; y++) {
    for (let u = 0; u < N; u++) {
      let val = 0;
      for (let x = 0; x < N; x++) {
        val += pixels[y * N + x] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
      }
      dct[y][u] = val;
    }
  }

  const low = [];
  for (let v = 0; v < PHASH_SIZE; v++) {
    for (let u = 0; u < PHASH_SIZE; u++) {
      let val = 0;
      for (let y = 0; y < N; y++) {
        val += dct[y][u] * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
      }
      low.push(val);
    }
  }

  const median = [...low].sort((a, b) => a - b)[Math.floor(low.length / 2)];
  const bits   = low.map((v) => (v > median ? 1 : 0));

  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += ((bits[i] << 3) | (bits[i+1] << 2) | (bits[i+2] << 1) | bits[i+3]).toString(16);
  }
  return hex;
}

function hammingDistance(h1, h2) {
  if (h1.length !== h2.length) return Infinity;
  const LUT = [0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4];
  let d = 0;
  for (let i = 0; i < h1.length; i++) {
    d += LUT[parseInt(h1[i], 16) ^ parseInt(h2[i], 16)];
  }
  return d;
}

function checkSimilarity(newHash, existingHashes) {
  for (const { id, phash } of existingHashes) {
    if (!phash) continue;
    const distance = hammingDistance(newHash, phash);
    if (distance <= SIMILARITY_THRESHOLD) {
      return { isSimilar: true, matchId: id, distance };
    }
  }
  return { isSimilar: false };
}

// ─── Local face detection (face-api.js + canvas) ─────────────────────────────

/**
 * Detect faces entirely on-device using SSD MobileNet v1.
 * Returns { faceCount, hasTooSmallFace, available }
 */
async function detectFaces(buffer, imageWidth, imageHeight) {
  const ready = await loadFaceModels();
  if (!ready) {
    return { faceCount: -1, hasTooSmallFace: false, available: false };
  }

  try {
    const { createCanvas, loadImage } = require('canvas');
    const img    = await loadImage(buffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx    = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const detections = await faceapi
      .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }));

    const w = imageWidth  || img.width;
    const h = imageHeight || img.height;

    // Filter out faces whose bounding box is too small relative to the image
    const validFaces = detections.filter((d) => {
      const bw = d.box.width  / w;
      const bh = d.box.height / h;
      return bw >= MIN_FACE_RATIO && bh >= MIN_FACE_RATIO;
    });

    const hasTooSmallFace = detections.length > 0 && validFaces.length === 0;

    return {
      faceCount:    validFaces.length,
      totalDetected: detections.length,
      hasTooSmallFace,
      available: true,
    };
  } catch (err) {
    logger.warn('Face detection error:', err.message);
    return { faceCount: -1, hasTooSmallFace: false, available: false };
  }
}

// ─── Main validation pipeline ─────────────────────────────────────────────────

async function validateAndProcess(rawBuffer, originalMime, fileSize, existingPhashes = []) {
  const rejectionReasons = [];

  // 1. Minimum file size
  if (fileSize < MIN_FILE_SIZE_BYTES) {
    rejectionReasons.push(
      `File too small (${fileSize} bytes — minimum is ${MIN_FILE_SIZE_BYTES} bytes)`
    );
  }

  // 2. HEIC → JPEG conversion
  const { buffer, mimeType, extension } = await normaliseImage(rawBuffer, originalMime);

  // 3. Resolution
  const meta   = await sharp(buffer).metadata();
  const width  = meta.width  || 0;
  const height = meta.height || 0;

  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    rejectionReasons.push(
      `Resolution too low (${width}×${height} — minimum is ${MIN_WIDTH}×${MIN_HEIGHT})`
    );
  }

  // 4. Blur
  const blurScore = await calculateBlurScore(buffer);
  if (blurScore < BLUR_THRESHOLD) {
    rejectionReasons.push(
      `Image appears blurry (sharpness: ${blurScore.toFixed(1)}, minimum: ${BLUR_THRESHOLD})`
    );
  }

  // 5. Duplicate / similarity
  const phash = await computePhash(buffer);
  const { isSimilar, matchId, distance } = checkSimilarity(phash, existingPhashes);
  if (isSimilar) {
    rejectionReasons.push(
      `Too similar to an existing image (id: ${matchId}, distance: ${distance})`
    );
  }

  // 6. Face detection (local — no cloud service)
  const { faceCount, hasTooSmallFace, available } = await detectFaces(buffer, width, height);
  if (available) {
    if (faceCount === 0) {
      rejectionReasons.push('No face detected in the image');
    } else if (hasTooSmallFace) {
      rejectionReasons.push('Detected face is too small within the image');
    } else if (faceCount > 1) {
      rejectionReasons.push(`Multiple faces detected (${faceCount})`);
    }
  }
  // If models aren't loaded yet, face check is skipped (non-blocking)

  return {
    accepted: rejectionReasons.length === 0,
    rejectionReasons,
    processedBuffer: buffer,
    processedMime:   mimeType,
    extension,
    width,
    height,
    blurScore,
    faceCount: available ? faceCount : null,
    phash,
    metadata: {
      format:   meta.format,
      channels: meta.channels,
      space:    meta.space,
    },
  };
}

module.exports = {
  validateAndProcess,
  computePhash,
  hammingDistance,
  checkSimilarity,
  calculateBlurScore,
  detectFaces,
  normaliseImage,
  BLUR_THRESHOLD,
  SIMILARITY_THRESHOLD,
  MIN_WIDTH,
  MIN_HEIGHT,
};
