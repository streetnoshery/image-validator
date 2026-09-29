const { isFaceModelsReady, waitForFaceModels } = require('../services/imageProcessingService');

/**
 * Gate uploads until face-detection models are loaded. Without this,
 * a request arriving during the brief startup window would silently
 * skip the "face too small" / "multiple faces" rules (see
 * imageProcessingService.analyzeImage's fail-closed fallback, which
 * this middleware exists to make unreachable in normal operation).
 */
async function requireFaceModels(req, res, next) {
  if (isFaceModelsReady()) return next();

  const ready = await waitForFaceModels(5000);
  if (!ready) {
    res.set('Retry-After', '5');
    return res.status(503).json({
      success: false,
      error:
        'Face detection models are still loading. Please retry in a few seconds. ' +
        'If this persists, run `node scripts/download-models.js` in the backend directory.',
    });
  }
  next();
}

module.exports = requireFaceModels;
