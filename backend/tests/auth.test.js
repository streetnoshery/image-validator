const request = require('supertest');

jest.mock('../src/models/User', () => require('./mocks/fakeUserModel'));
jest.mock('../src/models/Image', () => require('./mocks/fakeImageModel'));
jest.mock('../src/services/storageService', () => ({
  uploadFile: jest.fn(async (buffer, key) => key),
  deleteFile: jest.fn(async () => {}),
  getPresignedUrl: jest.fn(async (key) => `http://fake-storage/${key}?signed=1`),
}));
jest.mock('../src/services/imageProcessingService', () => ({
  isFaceModelsReady: jest.fn(() => true),
  waitForFaceModels: jest.fn(async () => true),
  analyzeImage: jest.fn(),
  checkSimilarity: jest.fn(),
}));

const app = require('../src/index');
const fakeUserModel = require('./mocks/fakeUserModel');

beforeEach(() => {
  fakeUserModel.__reset();
});

describe('POST /api/auth/register', () => {
  test('creates an account and returns a usable token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'correct-horse' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe('alice@example.com');
    expect(res.body.user.password_hash).toBeUndefined();
    expect(typeof res.body.token).toBe('string');
  });

  test('rejects a duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send({ email: 'bob@example.com', password: 'correct-horse' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'bob@example.com', password: 'another-password' });

    expect(res.status).toBe(409);
  });

  test('rejects an invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'correct-horse' });
    expect(res.status).toBe(400);
  });

  test('rejects a too-short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'carol@example.com', password: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({ email: 'dave@example.com', password: 'correct-horse' });
  });

  test('succeeds with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dave@example.com', password: 'correct-horse' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  test('fails with the wrong password using a generic error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dave@example.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
  });

  test('fails for a nonexistent email with the SAME generic error (no user enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
  });

  test('login is case-insensitive on email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'DAVE@EXAMPLE.COM', password: 'correct-horse' });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/auth/me', () => {
  test('requires authentication', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('returns the account matching the token', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'erin@example.com', password: 'correct-horse' });

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${registerRes.body.token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('erin@example.com');
    expect(meRes.body.user.id).toBe(registerRes.body.user.id);
  });

  test('rejects a garbage token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});
