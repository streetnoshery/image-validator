const request = require('supertest');

const TEST_USER = { id: 'test-user-1', email: 'test@example.com' };

jest.mock('../src/models/Image', () => require('./mocks/fakeImageModel'));

jest.mock('../src/services/storageService', () => ({
  uploadFile: jest.fn(async (buffer, key) => key),
  deleteFile: jest.fn(async () => {}),
  getPresignedUrl: jest.fn(async (key) => `http://fake-storage/${key}?signed=1`),
}));

// This suite tests the queueing/mutex orchestration, not auth itself
// (see auth.test.js and imageOwnership.test.js for that) — stub the
// authenticated user directly rather than minting real JWTs everywhere.
jest.mock('../src/middleware/requireAuth', () => (req, res, next) => {
  req.user = TEST_USER;
  next();
});

// Fully mocked (no jest.requireActual) so this suite doesn't pull in
// canvas/face-api/tfjs-node — the pixel-math is covered separately in
// imageProcessingService.test.js. Here we're testing the controller's
// queueing/polling/mutex orchestration, not the CV itself.
const MOCK_PROCESSING_DELAY_MS = 600;

jest.mock('../src/services/imageProcessingService', () => ({
  isFaceModelsReady: jest.fn(() => true),
  waitForFaceModels: jest.fn(async () => true),
  analyzeImage: jest.fn(async (buffer, mime) => {
    await new Promise((resolve) => setTimeout(resolve, MOCK_PROCESSING_DELAY_MS));
    return {
      rejectionReasons: [],
      processedBuffer: buffer,
      processedMime: mime,
      extension: 'jpg',
      width: 800,
      height: 600,
      blurScore: 500,
      faceCount: 1,
      phash: buffer.slice(0, 4).toString('hex'),
      metadata: {},
    };
  }),
  checkSimilarity: jest.fn((newHash, existingHashes) => {
    const match = existingHashes.find(({ phash }) => phash === newHash);
    return match ? { isSimilar: true, matchId: match.id, distance: 0 } : { isSimilar: false };
  }),
}));

const app = require('../src/index');
const fakeImageModel = require('./mocks/fakeImageModel');

function waitUntil(conditionFn, { timeout = 5000, interval = 50 } = {}) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (conditionFn()) return resolve();
      if (Date.now() - startedAt > timeout) return reject(new Error('waitUntil() timed out'));
      setTimeout(check, interval);
    };
    check();
  });
}

beforeEach(() => {
  fakeImageModel.__reset();
});

describe('POST /api/images/upload', () => {
  // Cold JIT/Express/multer overhead on the very first request in the
  // process can itself take a couple hundred ms — warm that up first so
  // the timing assertion below measures the queueing behavior, not
  // one-time startup cost.
  beforeAll(async () => {
    await request(app)
      .post('/api/images/upload')
      .attach('images', Buffer.from([0xff]), { filename: 'warmup.jpg', contentType: 'image/jpeg' });
    await waitUntil(() => [...fakeImageModel.__store.values()].every((r) => r.status !== 'queued'));
    fakeImageModel.__reset();
  });

  test('responds 202 with queued items BEFORE background processing finishes', async () => {
    const startedAt = Date.now();
    const res = await request(app)
      .post('/api/images/upload')
      .attach('images', Buffer.from([0x01, 0x02, 0x03, 0x04]), {
        filename: 'a.jpg',
        contentType: 'image/jpeg',
      });
    const elapsedMs = Date.now() - startedAt;

    expect(res.status).toBe(202);
    // Proves the request isn't blocked on the mocked pipeline's delay.
    expect(elapsedMs).toBeLessThan(MOCK_PROCESSING_DELAY_MS / 2);
    expect(res.body.queued).toHaveLength(1);
    expect(res.body.queued[0].status).toBe('queued');

    const id = res.body.queued[0].id;
    expect(fakeImageModel.__store.get(id).status).toBe('queued');

    await waitUntil(() => fakeImageModel.__store.get(id).status !== 'queued');
    expect(fakeImageModel.__store.get(id).status).toBe('accepted');
  });

  test('rejects unsupported file types synchronously, without queueing', async () => {
    const res = await request(app)
      .post('/api/images/upload')
      .attach('images', Buffer.from('not an image'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(fakeImageModel.__store.size).toBe(0);
  });

  test('two similar images processed concurrently: only one ends up accepted', async () => {
    // Same first 4 bytes -> mocked analyzeImage derives the same phash for both.
    const bufferA = Buffer.from([0xaa, 0xaa, 0xaa, 0xaa, 1, 2, 3]);
    const bufferB = Buffer.from([0xaa, 0xaa, 0xaa, 0xaa, 9, 8, 7]);

    const res = await request(app)
      .post('/api/images/upload')
      .attach('images', bufferA, { filename: 'dup-a.jpg', contentType: 'image/jpeg' })
      .attach('images', bufferB, { filename: 'dup-b.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(202);
    const [idA, idB] = res.body.queued.map((q) => q.id);

    await waitUntil(() => {
      const a = fakeImageModel.__store.get(idA);
      const b = fakeImageModel.__store.get(idB);
      return a.status !== 'queued' && b.status !== 'queued';
    });

    const statuses = [fakeImageModel.__store.get(idA).status, fakeImageModel.__store.get(idB).status];
    expect(statuses.filter((s) => s === 'accepted')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'rejected')).toHaveLength(1);
  });
});

describe('GET /api/images/batch', () => {
  test('requires an ids query param', async () => {
    const res = await request(app).get('/api/images/batch');
    expect(res.status).toBe(400);
  });

  test('returns only the rows that exist, ignoring unknown ids', async () => {
    await fakeImageModel.create({
      id: 'x1',
      user_id: TEST_USER.id,
      status: 'accepted',
      original_filename: 'x1.jpg',
    });

    const res = await request(app).get('/api/images/batch').query({ ids: 'x1,does-not-exist' });

    expect(res.status).toBe(200);
    expect(res.body.images).toHaveLength(1);
    expect(res.body.images[0].id).toBe('x1');
  });
});
