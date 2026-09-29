jest.mock('../src/services/imageProcessingService', () => ({
  isFaceModelsReady: jest.fn(),
  waitForFaceModels: jest.fn(),
}));

const {
  isFaceModelsReady,
  waitForFaceModels,
} = require('../src/services/imageProcessingService');
const requireFaceModels = require('../src/middleware/requireFaceModels');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  return res;
}

describe('requireFaceModels middleware', () => {
  afterEach(() => jest.clearAllMocks());

  test('calls next() immediately when models are already ready', async () => {
    isFaceModelsReady.mockReturnValue(true);
    const next = jest.fn();

    await requireFaceModels({}, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(waitForFaceModels).not.toHaveBeenCalled();
  });

  test('waits for models and proceeds if they finish loading in time', async () => {
    isFaceModelsReady.mockReturnValue(false);
    waitForFaceModels.mockResolvedValue(true);
    const next = jest.fn();

    await requireFaceModels({}, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('fails closed with 503 + Retry-After when models are not ready in time', async () => {
    isFaceModelsReady.mockReturnValue(false);
    waitForFaceModels.mockResolvedValue(false);
    const next = jest.fn();
    const res = mockRes();

    await requireFaceModels({}, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('Retry-After', '5');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.any(String) })
    );
  });
});
