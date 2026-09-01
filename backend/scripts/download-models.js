/**
 * Copies the face-api.js SSD MobileNet v1 model weights into backend/models/.
 * The weights ship inside the @vladmandic/face-api npm package itself, so no
 * network access is required. Run once before starting the server:
 *
 *   node scripts/download-models.js
 */

const fs   = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '../models');
const SRC_DIR     = path.join(__dirname, '../node_modules/@vladmandic/face-api/model');

// Only the SSD MobileNet v1 model is needed for face detection
const FILES = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model.bin',
];

if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

console.log('Copying face-api.js model weights...');
for (const f of FILES) {
  const src  = path.join(SRC_DIR, f);
  const dest = path.join(MODELS_DIR, f);
  fs.copyFileSync(src, dest);
  console.log(`  ✓ ${f}`);
}
console.log('\nDone. Models saved to backend/models/');
