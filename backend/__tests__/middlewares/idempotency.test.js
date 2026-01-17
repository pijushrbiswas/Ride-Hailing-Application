/**
 * Unit tests for idempotency middleware
 */

const idempotencyMiddleware = require('../../src/middlewares/idempotency.middleware');
const redis = require('../../src/utils/redis');

jest.mock('../../src/utils/redis');

describe('Idempotency Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      body: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should proceed if no idempotency key provided', async () => {
    await idempotencyMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('should return cached response if exists', async () => {
    const cachedResponse = { id: 'ride-123', status: 'MATCHING' };
    req.headers['idempotency-key'] = 'test-key-123';
    redis.get.mockResolvedValue(JSON.stringify(cachedResponse));

    await idempotencyMiddleware(req, res, next);

    expect(redis.get).toHaveBeenCalledWith('idem:test-key-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(cachedResponse);
    expect(next).not.toHaveBeenCalled();
  });

  it('should wrap res.json if no cached response', async () => {
    req.headers['idempotency-key'] = 'new-key-123';
    redis.get.mockResolvedValue(null);
    redis.setEx = jest.fn().mockResolvedValue('OK');

    await idempotencyMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();

    // Test that res.json was wrapped
    const responseData = { id: 'ride-123', status: 'MATCHING' };
    res.json(responseData);

    expect(redis.setEx).toHaveBeenCalledWith(
      'idem:new-key-123',
      300,
      JSON.stringify(responseData)
    );
  });

  it('should use correct key prefix', async () => {
    req.headers['idempotency-key'] = 'my-unique-key';
    redis.get.mockResolvedValue(null);

    await idempotencyMiddleware(req, res, next);

    expect(redis.get).toHaveBeenCalledWith('idem:my-unique-key');
  });
});
