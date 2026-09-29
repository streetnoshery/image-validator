const sharp = require('sharp');
const {
  calculateBlurScore,
  computePhash,
  hammingDistance,
  checkSimilarity,
  filterValidFaces,
  normaliseImage,
  SIMILARITY_THRESHOLD,
  MIN_FACE_RATIO,
} = require('../src/services/imageProcessingService');

const SIZE = 64;

/** Deterministic (not random) high-frequency checkerboard — lots of edges. */
async function makeSharpImage() {
  const raw = Buffer.alloc(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      raw[y * SIZE + x] = (x + y) % 2 === 0 ? 255 : 0;
    }
  }
  return sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 1 } }).png().toBuffer();
}

/** Deterministic pseudo-noise — structurally different from the checkerboard. */
async function makeDifferentImage() {
  const raw = Buffer.alloc(SIZE * SIZE);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = (i * 37 + 91) % 256;
  }
  return sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 1 } }).png().toBuffer();
}

async function makeSolidImage(value = 128) {
  const raw = Buffer.alloc(SIZE * SIZE, value);
  return sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 1 } }).png().toBuffer();
}

describe('calculateBlurScore', () => {
  test('a high-frequency image scores higher (sharper) than its blurred version', async () => {
    const sharpImage = await makeSharpImage();
    const blurredImage = await sharp(sharpImage).blur(10).toBuffer();

    const sharpScore = await calculateBlurScore(sharpImage);
    const blurredScore = await calculateBlurScore(blurredImage);

    expect(sharpScore).toBeGreaterThan(blurredScore);
  });

  test('a flat solid-color image scores near zero (maximally blurry)', async () => {
    const solidImage = await makeSolidImage();
    const score = await calculateBlurScore(solidImage);
    expect(score).toBeLessThan(1);
  });
});

describe('computePhash / hammingDistance / checkSimilarity', () => {
  test('the same image produces identical hashes (distance 0)', async () => {
    const image = await makeSharpImage();
    const hashA = await computePhash(image);
    const hashB = await computePhash(image);
    expect(hammingDistance(hashA, hashB)).toBe(0);
  });

  test('structurally different images produce hashes above the similarity threshold', async () => {
    const imageA = await makeSharpImage();
    const imageB = await makeDifferentImage();
    const hashA = await computePhash(imageA);
    const hashB = await computePhash(imageB);
    expect(hammingDistance(hashA, hashB)).toBeGreaterThan(SIMILARITY_THRESHOLD);
  });

  test('checkSimilarity flags a match within threshold and reports the matching id', async () => {
    const image = await makeSharpImage();
    const hash = await computePhash(image);

    const result = checkSimilarity(hash, [{ id: 'existing-1', phash: hash }]);
    expect(result.isSimilar).toBe(true);
    expect(result.matchId).toBe('existing-1');
  });

  test('checkSimilarity does not flag dissimilar hashes', async () => {
    const imageA = await makeSharpImage();
    const imageB = await makeDifferentImage();
    const hashA = await computePhash(imageA);
    const hashB = await computePhash(imageB);

    const result = checkSimilarity(hashA, [{ id: 'existing-1', phash: hashB }]);
    expect(result.isSimilar).toBe(false);
  });

  test('hammingDistance returns Infinity for mismatched hash lengths', () => {
    expect(hammingDistance('ab', 'abcd')).toBe(Infinity);
  });
});

describe('normaliseImage', () => {
  test('passes PNG through unchanged with the right extension', async () => {
    const image = await makeSharpImage();
    const result = await normaliseImage(image, 'image/png');
    expect(result.mimeType).toBe('image/png');
    expect(result.extension).toBe('png');
    expect(result.buffer).toBe(image);
  });

  test('passes JPEG through unchanged with the right extension', async () => {
    const image = await sharp(await makeSharpImage()).jpeg().toBuffer();
    const result = await normaliseImage(image, 'image/jpeg');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.extension).toBe('jpg');
    expect(result.buffer).toBe(image);
  });
});

describe('filterValidFaces', () => {
  const imageWidth = 1000;
  const imageHeight = 1000;

  test('keeps faces whose bounding box meets the minimum ratio in both dimensions', () => {
    const detections = [{ box: { width: 100, height: 100 } }]; // 10% x 10%
    const result = filterValidFaces(detections, imageWidth, imageHeight);
    expect(result).toHaveLength(1);
  });

  test('drops faces smaller than MIN_FACE_RATIO', () => {
    const tooSmall = MIN_FACE_RATIO * imageWidth * 0.5;
    const detections = [{ box: { width: tooSmall, height: tooSmall } }];
    const result = filterValidFaces(detections, imageWidth, imageHeight);
    expect(result).toHaveLength(0);
  });

  test('drops a face that is wide enough but not tall enough (or vice versa)', () => {
    const wideButShort = [{ box: { width: 500, height: 10 } }];
    expect(filterValidFaces(wideButShort, imageWidth, imageHeight)).toHaveLength(0);
  });

  test('keeps multiple valid faces and filters mixed batches correctly', () => {
    const detections = [
      { box: { width: 200, height: 200 } }, // valid
      { box: { width: 5, height: 5 } },     // invalid
      { box: { width: 150, height: 150 } }, // valid
    ];
    expect(filterValidFaces(detections, imageWidth, imageHeight)).toHaveLength(2);
  });

  test('returns an empty array when image dimensions are missing', () => {
    const detections = [{ box: { width: 200, height: 200 } }];
    expect(filterValidFaces(detections, 0, 0)).toEqual([]);
  });
});
