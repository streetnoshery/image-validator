const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/Image', () => require('./mocks/fakeImageModel'));
jest.mock('../src/services/storageService', () => ({
  uploadFile: jest.fn(async (buffer, key) => key),
  deleteFile: jest.fn(async () => {}),
  getPresignedUrl: jest.fn(async (key) => `http://fake-storage/${key}?signed=1`),
}));
jest.mock('../src/services/imageProcessingService', () => ({
  isFaceModelsReady: jest.fn(() => true),
  waitForFaceModels: jest.fn(async () => true),
  analyzeImage: jest.fn(async (buffer, mime) => ({
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
  })),
  // Real exact-match behavior (not just "always false") — the point of
  // these tests is proving isolation comes from Image.getAllPhashes(userId)
  // scoping what checkSimilarity is even compared against, not from
  // checkSimilarity itself being faked to look isolated.
  checkSimilarity: jest.fn((newHash, existingHashes) => {
    const match = existingHashes.find(({ phash }) => phash === newHash);
    return match ? { isSimilar: true, matchId: match.id, distance: 0 } : { isSimilar: false };
  }),
}));

// This suite deliberately does NOT mock requireAuth — it's exercising
// the real middleware + real JWT verification against tokens signed
// with the same (test-ephemeral) secret the app itself loaded.
const app = require('../src/index');
const { JWT_SECRET } = require('../src/config/auth');
const fakeImageModel = require('./mocks/fakeImageModel');

function tokenFor(userId, email) {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: '1h' });
}

const USER_A = { id: 'user-a', email: 'a@example.com' };
const USER_B = { id: 'user-b', email: 'b@example.com' };
const tokenA = tokenFor(USER_A.id, USER_A.email);
const tokenB = tokenFor(USER_B.id, USER_B.email);

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

describe('authentication is required for every /api/images route', () => {
  test.each([
    ['post', '/api/images/upload'],
    ['get', '/api/images'],
    ['get', '/api/images/batch?ids=x'],
    ['get', '/api/images/some-id'],
    ['delete', '/api/images/some-id'],
    ['get', '/api/images/stats'],
    ['post', '/api/images/claim'],
  ])('%s %s -> 401 without a token', async (method, url) => {
    const res = await request(app)[method](url);
    expect(res.status).toBe(401);
  });

  test('a malformed Authorization header is rejected', async () => {
    const res = await request(app).get('/api/images').set('Authorization', 'not-bearer garbage');
    expect(res.status).toBe(401);
  });
});

describe('per-user data isolation', () => {
  test("user B cannot see, list, batch-poll, or delete user A's image", async () => {
    const uploadRes = await request(app)
      .post('/api/images/upload')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('images', Buffer.from([1, 2, 3, 4]), { filename: 'a.jpg', contentType: 'image/jpeg' });

    expect(uploadRes.status).toBe(202);
    const imageId = uploadRes.body.queued[0].id;

    await waitUntil(() => fakeImageModel.__store.get(imageId).status !== 'queued');

    const aGet = await request(app).get(`/api/images/${imageId}`).set('Authorization', `Bearer ${tokenA}`);
    expect(aGet.status).toBe(200);

    const bGet = await request(app).get(`/api/images/${imageId}`).set('Authorization', `Bearer ${tokenB}`);
    expect(bGet.status).toBe(404);

    const bBatch = await request(app)
      .get('/api/images/batch')
      .query({ ids: imageId })
      .set('Authorization', `Bearer ${tokenB}`);
    expect(bBatch.body.images).toHaveLength(0);

    const bList = await request(app).get('/api/images').set('Authorization', `Bearer ${tokenB}`);
    expect(bList.body.images.find((i) => i.id === imageId)).toBeUndefined();

    const bDelete = await request(app).delete(`/api/images/${imageId}`).set('Authorization', `Bearer ${tokenB}`);
    expect(bDelete.status).toBe(404);
    expect(fakeImageModel.__store.get(imageId)).toBeDefined(); // A's row survives B's delete attempt
  });

  test('duplicate-image detection is scoped per-user, not global', async () => {
    // Identical bytes -> the mocked analyzeImage derives the identical
    // phash for both users' uploads.
    const buf = Buffer.from([0xaa, 0xaa, 0xaa, 0xaa]);

    const resA = await request(app)
      .post('/api/images/upload')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('images', buf, { filename: 'x.jpg', contentType: 'image/jpeg' });
    const idA = resA.body.queued[0].id;
    await waitUntil(() => fakeImageModel.__store.get(idA).status !== 'queued');
    expect(fakeImageModel.__store.get(idA).status).toBe('accepted');

    const resB = await request(app)
      .post('/api/images/upload')
      .set('Authorization', `Bearer ${tokenB}`)
      .attach('images', buf, { filename: 'y.jpg', contentType: 'image/jpeg' });
    const idB = resB.body.queued[0].id;
    await waitUntil(() => fakeImageModel.__store.get(idB).status !== 'queued');

    // If duplicate-checking were global, B's upload would be rejected as
    // "too similar" to A's — it must not be.
    expect(fakeImageModel.__store.get(idB).status).toBe('accepted');
  });

  test('POST /api/images/claim only adopts ownerless rows, and only once', async () => {
    await fakeImageModel.create({ id: 'legacy-1', user_id: null, status: 'accepted', original_filename: 'old.jpg' });

    const claimA = await request(app).post('/api/images/claim').set('Authorization', `Bearer ${tokenA}`);
    expect(claimA.body.claimed).toBe(1);
    expect(fakeImageModel.__store.get('legacy-1').user_id).toBe(USER_A.id);

    // Already claimed — a second caller gets nothing.
    const claimB = await request(app).post('/api/images/claim').set('Authorization', `Bearer ${tokenB}`);
    expect(claimB.body.claimed).toBe(0);
    expect(fakeImageModel.__store.get('legacy-1').user_id).toBe(USER_A.id);
  });
});
