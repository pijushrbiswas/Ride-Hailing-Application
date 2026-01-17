/**
 * Integration tests for rides API
 */

const request = require('supertest');
const db = require('../../src/db');
const redis = require('../../src/utils/redis');
const matchingService = require('../../src/services/matching.service');

jest.mock('../../src/db');
jest.mock('../../src/utils/redis');
jest.mock('../../src/services/matching.service');
jest.mock('../../src/services/notification.service', () => ({
  notifyRideCreated: jest.fn().mockResolvedValue(true),
  notifyRideAssigned: jest.fn().mockResolvedValue(true)
}));

// Import app AFTER mocks
const app = require('../../src/app');

describe('Rides API', () => {
  describe('POST /v1/rides', () => {
    beforeEach(() => {
      redis.setEx = jest.fn().mockResolvedValue('OK');
      redis.get = jest.fn().mockResolvedValue(null);
    });

    it('should create a ride with valid data', async () => {
      const mockRide = {
        id: 'ride-123',
        rider_id: 'rider-1',
        pickup_latitude: 37.7749,
        pickup_longitude: -122.4194,
        status: 'MATCHING'
      };

      db.query.mockResolvedValue({ rows: [mockRide] });
      matchingService.findNearbyDrivers.mockResolvedValue([]);

      const response = await request(app)
        .post('/v1/rides')
        .set('Idempotency-Key', 'test-key-123')
        .send({
          rider_id: 'rider-1',
          pickup_latitude: 37.7749,
          pickup_longitude: -122.4194,
          drop_latitude: 37.8049,
          drop_longitude: -122.4294
        });

      expect(response.status).toBe(201);
      expect(response.body.ride).toBeDefined();
      expect(response.body.candidate_drivers).toBeDefined();
    });

    it('should reject invalid latitude', async () => {
      const response = await request(app)
        .post('/v1/rides')
        .set('Idempotency-Key', 'test-key-123')
        .send({
          rider_id: 'rider-1',
          pickup_latitude: 200, // Invalid
          pickup_longitude: -122.4194,
          drop_latitude: 37.8049,
          drop_longitude: -122.4294
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.toLowerCase()).toContain('latitude');
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/v1/rides')
        .set('Idempotency-Key', 'test-key-123')
        .send({
          rider_id: 'rider-1'
          // Missing coordinates
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toContain('required');
    });

    it('should reject invalid tier', async () => {
      const response = await request(app)
        .post('/v1/rides')
        .set('Idempotency-Key', 'test-key-123')
        .send({
          rider_id: 'rider-1',
          pickup_latitude: 37.7749,
          pickup_longitude: -122.4194,
          drop_latitude: 37.8049,
          drop_longitude: -122.4294,
          tier: 'INVALID_TIER'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.toLowerCase()).toContain('tier');
    });
  });

  describe('GET /v1/rides/:id', () => {
    it('should return ride by id', async () => {
      const mockRide = { id: 'ride-123', status: 'MATCHING' };
      db.query.mockResolvedValue({ rows: [mockRide], rowCount: 1 });

      const response = await request(app)
        .get('/v1/rides/550e8400-e29b-41d4-a716-446655440000');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockRide);
    });

    it('should reject invalid UUID format', async () => {
      const response = await request(app)
        .get('/v1/rides/invalid-uuid');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid id format');
    });
  });
});
