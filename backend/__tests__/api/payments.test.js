/**
 * Integration tests for payments API with idempotency
 */

const request = require('supertest');
const db = require('../../src/db');
const redis = require('../../src/utils/redis');

jest.mock('../../src/db');
jest.mock('../../src/utils/redis');
jest.mock('../../src/services/notification.service', () => ({
  notifyPaymentCompleted: jest.fn().mockResolvedValue(true),
  notifyPaymentFailed: jest.fn().mockResolvedValue(true)
}));

// Import app AFTER mocks
const app = require('../../src/app');

describe('Payments API', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    db.getClient = jest.fn().mockResolvedValue(mockClient);
  });

  describe('POST /v1/payments', () => {
    it('should create payment successfully', async () => {
      const mockPayment = {
        id: 'payment-123',
        trip_id: '550e8400-e29b-41d4-a716-446655440000',
        amount: 25.00,
        status: 'PENDING'
      };

      redis.get.mockResolvedValue(null); // No cached response
      redis.setEx = jest.fn().mockResolvedValue('OK'); // Override with fresh mock
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ // SELECT trip
          rows: [{ id: '550e8400-e29b-41d4-a716-446655440000', total_fare: 25.00 }],
          rowCount: 1
        })
        .mockResolvedValueOnce({ rows: [mockPayment] }) // INSERT payment
        .mockResolvedValueOnce() // INSERT outbox
        .mockResolvedValueOnce(); // COMMIT

      const response = await request(app)
        .post('/v1/payments')
        .set('Idempotency-Key', 'test-key-123')
        .send({
          trip_id: '550e8400-e29b-41d4-a716-446655440000',
          amount: 25.00,
          payment_method: 'CARD',
          rider_id: '650e8400-e29b-41d4-a716-446655440000'
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockPayment);
      expect(redis.setEx).toHaveBeenCalledWith(
        'idem:test-key-123',
        300,
        expect.any(String)
      );
    });

    it('should return cached response for duplicate idempotency key', async () => {
      const cachedPayment = { id: 'payment-123', status: 'COMPLETED' };
      redis.get.mockResolvedValue(JSON.stringify(cachedPayment));

      const response = await request(app)
        .post('/v1/payments')
        .set('Idempotency-Key', 'duplicate-key')
        .send({
          trip_id: '550e8400-e29b-41d4-a716-446655440000',
          amount: 25.00,
          payment_method: 'CARD',
          rider_id: '650e8400-e29b-41d4-a716-446655440000'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(cachedPayment);
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('should work without idempotency key', async () => {
      redis.get.mockResolvedValue(null);
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ // SELECT trip
          rows: [{ id: '550e8400-e29b-41d4-a716-446655440000', total_fare: 25.00 }],
          rowCount: 1
        })
        .mockResolvedValueOnce({ // INSERT payment
          rows: [{ id: 'payment-456', trip_id: '550e8400-e29b-41d4-a716-446655440000', amount: 25.00, status: 'PENDING' }]
        })
        .mockResolvedValueOnce() // INSERT outbox
        .mockResolvedValueOnce(); // COMMIT

      const response = await request(app)
        .post('/v1/payments')
        .send({
          trip_id: '550e8400-e29b-41d4-a716-446655440000',
          amount: 25.00
        });

      expect(response.status).toBe(201);
    });

    it('should validate amount range', async () => {
      redis.get.mockResolvedValue(null);
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ // SELECT trip returns negative amount
          rows: [{ id: '550e8400-e29b-41d4-a716-446655440000', total_fare: -10 }],
          rowCount: 1
        });

      const response = await request(app)
        .post('/v1/payments')
        .set('Idempotency-Key', 'test-key-validate')
        .send({
          trip_id: '550e8400-e29b-41d4-a716-446655440000',
          payment_method: 'CARD',
          rider_id: '650e8400-e29b-41d4-a716-446655440000'
        });

      // Service will throw error for invalid fare from trip
      expect(response.status).toBe(500);
    });

    it('should respect payment rate limiting', async () => {
      redis.get.mockResolvedValue(null);
      mockClient.query
        .mockResolvedValue() // Mock all queries
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'payment-123' }] }) // INSERT
        .mockResolvedValueOnce() // INSERT outbox
        .mockResolvedValueOnce(); // COMMIT
      redis.setex.mockResolvedValue('OK');

      // Send 11 requests (limit is 10/15min)
      const requests = [];
      for (let i = 0; i < 11; i++) {
        requests.push(
          request(app)
            .post('/v1/payments')
            .set('Idempotency-Key', `key-${i}`)
            .send({
              trip_id: '550e8400-e29b-41d4-a716-446655440000',
              amount: 25.00,
              payment_method: 'CARD',
              rider_id: '650e8400-e29b-41d4-a716-446655440000'
            })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('POST /v1/payments/webhooks/psp', () => {
    it('should process webhook successfully', async () => {
      db.query
        .mockResolvedValueOnce({ // UPDATE payment
          rows: [{ 
            id: 'payment-123', 
            status: 'COMPLETED',
            trip_id: 'trip-123'
          }],
          rowCount: 1
        })
        .mockResolvedValueOnce({ // SELECT rider from trip
          rows: [{ rider_id: 'rider-1' }],
          rowCount: 1
        });

      const response = await request(app)
        .post('/v1/payments/webhooks/psp')
        .set('X-PSP-Signature', 'valid-signature')
        .send({
          payment_id: 'payment-123',
          status: 'succeeded',
          transaction_id: 'psp-txn-123'
        });

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
      expect(response.body.payment_id).toBe('payment-123');
    });

    it('should reject webhook without signature', async () => {
      const response = await request(app)
        .post('/v1/payments/webhooks/psp')
        .send({
          payment_id: 'payment-123',
          status: 'success'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('signature');
    });
  });

  describe('GET /v1/payments/:id', () => {
    it('should return payment by id', async () => {
      const mockPayment = { id: 'payment-123', amount: 25.00, status: 'COMPLETED' };
      db.query.mockResolvedValue({ rows: [mockPayment], rowCount: 1 });

      const response = await request(app)
        .get('/v1/payments/550e8400-e29b-41d4-a716-446655440000');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockPayment);
    });

    it('should return 404 for non-existent payment', async () => {
      db.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(app)
        .get('/v1/payments/550e8400-e29b-41d4-a716-446655440000');

      expect(response.status).toBe(404);
    });
  });
});
