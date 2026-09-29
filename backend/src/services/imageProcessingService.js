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
let faceModelsLoadPromise = null;

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

/**
 * Kick off model loading once (memoized) — called at module load and
 * reusable by the readiness middleware so concurrent callers share
 * the same in-flight load instead of racing separate calls.
 */
function ensureFaceModelsLoading() {
  if (!faceModelsLoadPromise) {
    faceModelsLoadPromise = loadFaceModels().catch((err) => {
      logger.warn(`Face model load failed: ${err.message}`);
      return false;
    });
  }
  return faceModelsLoadPromise;
}

function isFaceModelsReady() {
  return faceModelsLoaded;
}

/**
 * Wait (bounded) for face models to finish loading. Used by the
 * upload route so a request arriving during the brief startup window
 * doesn't get silently processed without a face check — see
 * middleware/requireFaceModels.js.
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
async function waitForFaceModels(timeoutMs = 5000) {
  if (faceModelsLoaded) return true;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
  return Promise.race([ensureFaceModelsLoading(), timeout]);
}

// Kick off model loading at startup (non-blocking)
ensureFaceModelsLoading();

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
 * Pure filter: keep only detections whose bounding box covers at least
 * MIN_FACE_RATIO of the image in both dimensions. Extracted from
 * detectFaces() so the sizing rule can be unit-tested without loading
 * the CNN models.
 * @param {Array<{box: {width: number, height: number}}>} detections
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @returns {Array}
 */
function filterValidFaces(detections, imageWidth, imageHeight) {
  if (!imageWidth || !imageHeight) return [];
  return detections.filter((d) => {
    const bw = d.box.width  / imageWidth;
    const bh = d.box.height / imageHeight;
    return bw >= MIN_FACE_RATIO && bh >= MIN_FACE_RATIO;
  });
}

/**
 * Detect faces entirely on-device using SSD MobileNet v1.
 * Returns { faceCount, hasTooSmallFace, available }
 */
async function detectFaces(buffer, imageWidth, imageHeight) {
  const ready = await ensureFaceModelsLoading();
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

    const validFaces = filterValidFaces(detections, w, h);
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

/**
 * Run every validation rule EXCEPT duplicate/similarity detection, which
 * requires cross-referencing an in-flight batch's other jobs and is
 * checked separately by the caller under a mutex (see imageController.js) —
 * doing it here would race when multiple uploads are processed concurrently
 * by the background queue.
 */
async function analyzeImage(rawBuffer, originalMime, fileSize) {
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

  // 5. Perceptual hash (used by the caller for the duplicate check)
  const phash = await computePhash(buffer);

  // 6. Face detection (local — no cloud service)
  // Fail CLOSED: if the models aren't available, we cannot verify rules
  // 5/6 of the spec (face-too-small / multiple-faces), so the image is
  // rejected rather than silently accepted without that check having run.
  // In normal operation this path shouldn't be reached at all — the
  // requireFaceModels middleware blocks uploads until models are ready —
  // this is defense in depth for any race at process startup.
  const { faceCount, hasTooSmallFace, available } = await detectFaces(buffer, width, height);
  if (!available) {
    rejectionReasons.push('Face detection temporarily unavailable — please retry your upload.');
  } else if (faceCount === 0) {
    rejectionReasons.push('No face detected in the image');
  } else if (hasTooSmallFace) {
    rejectionReasons.push('Detected face is too small within the image');
  } else if (faceCount > 1) {
    rejectionReasons.push(`Multiple faces detected (${faceCount})`);
  }

  return {
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
  analyzeImage,
  computePhash,
  hammingDistance,
  checkSimilarity,
  calculateBlurScore,
  detectFaces,
  filterValidFaces,
  normaliseImage,
  isFaceModelsReady,
  waitForFaceModels,
  BLUR_THRESHOLD,
  SIMILARITY_THRESHOLD,
  MIN_WIDTH,
  MIN_HEIGHT,
  MIN_FACE_RATIO,
};
