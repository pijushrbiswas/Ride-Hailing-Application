/**
 * Integration tests for trips API
 */

const request = require('supertest');
const db = require('../../src/db');
const redis = require('../../src/utils/redis');

jest.mock('../../src/db');
jest.mock('../../src/utils/redis');

// Import app AFTER mocks
const app = require('../../src/app');

describe('Trips API', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    db.getClient = jest.fn().mockResolvedValue(mockClient);
  });

  describe('POST /v1/trips/:id/start', () => {
    it('should start trip successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ // SELECT trip
          rows: [{
            id: 'trip-123',
            rider_id: 'rider-1',
            status: 'CREATED',
            tier: 'ECONOMY'
          }],
          rowCount: 1
        })
        .mockResolvedValueOnce({ // UPDATE trip
          rows: [{
            id: 'trip-123',
            status: 'STARTED',
            started_at: new Date()
          }]
        })
        .mockResolvedValueOnce(); // COMMIT

      const response = await request(app)
        .post('/v1/trips/550e8400-e29b-41d4-a716-446655440000/start');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('STARTED');
    });
  });

  describe('POST /v1/trips/:id/end', () => {
    it('should end trip and calculate fare', async () => {
      const startTime = new Date('2026-01-15T10:00:00Z');

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ // SELECT trip
          rows: [{
            id: 'trip-123',
            rider_id: 'rider-1',
            ride_id: 'ride-123',
            driver_id: 'driver-1',
            tier: 'ECONOMY',
            surge_multiplier: 1.0,
            status: 'STARTED',
            started_at: startTime
          }],
          rowCount: 1
        })
        .mockResolvedValueOnce({ // UPDATE trip
          rows: [{
            id: 'trip-123',
            status: 'ENDED',
            distance_km: 10,
            duration_sec: 1200,
            base_fare: 5.00,
            total_fare: 25.00
          }],
          rowCount: 1
        })
        .mockResolvedValueOnce({ // UPDATE driver to AVAILABLE
          rows: [{ id: 'driver-1', status: 'AVAILABLE' }],
          rowCount: 1
        })
        .mockResolvedValueOnce({ // UPDATE ride to COMPLETED
          rows: [{ id: 'ride-123', status: 'COMPLETED' }],
          rowCount: 1
        })
        .mockResolvedValueOnce(); // COMMIT

      const response = await request(app)
        .post('/v1/trips/550e8400-e29b-41d4-a716-446655440000/end')
        .send({
          distance_km: 10,
          duration_sec: 1200
        });

      expect(response.status).toBe(200);
      expect(response.body.total_fare).toBe(25.00);
      expect(response.body.fare_breakdown).toBeDefined();
    });

    it('should validate distance range', async () => {
      const response = await request(app)
        .post('/v1/trips/550e8400-e29b-41d4-a716-446655440000/end')
        .send({
          distance_km: 2000, // Too far
          duration_sec: 1200
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('distance');
    });

    it('should validate duration range', async () => {
      const response = await request(app)
        .post('/v1/trips/550e8400-e29b-41d4-a716-446655440000/end')
        .send({
          distance_km: 10,
          duration_sec: 100000 // Too long
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('duration');
    });
  });

  describe('GET /v1/trips/:id/receipt', () => {
    it('should generate receipt for completed trip', async () => {
      db.query.mockResolvedValue({
        rows: [{
          trip_id: 'trip-123',
          ride_id: 'ride-123',
          distance_km: 10,
          duration_sec: 1200,
          base_fare: 5.00,
          total_fare: 25.00,
          tier: 'ECONOMY',
          surge_multiplier: 1.0,
          payment_method: 'CARD',
          started_at: new Date(),
          ended_at: new Date(),
          pickup_latitude: 37.7749,
          pickup_longitude: -122.4194,
          drop_latitude: 37.8049,
          drop_longitude: -122.4094,
          driver_name: 'John Doe',
          driver_phone: '+1234567890',
          driver_rating: 4.8,
          payment_status: 'COMPLETED',
          psp_transaction_id: 'txn-123'
        }],
        rowCount: 1
      });

      const response = await request(app)
        .get('/v1/trips/550e8400-e29b-41d4-a716-446655440000/receipt');

      expect(response.status).toBe(200);
      expect(response.body.trip_id).toBe('trip-123');
      expect(response.body.fare_breakdown).toBeDefined();
      expect(response.body.fare_breakdown.base_fare).toBe(5);
      expect(response.body.fare_breakdown.total).toBe(25.00);
      expect(response.body.driver.name).toBe('John Doe');
    });

    it('should return error for non-existent trip', async () => {
      db.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(app)
        .get('/v1/trips/550e8400-e29b-41d4-a716-446655440000/receipt');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('POST /v1/trips/:id/pause', () => {
    it('should pause active trip', async () => {
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ // SELECT trip FOR UPDATE
          rows: [{ id: 'trip-123', status: 'STARTED' }],
          rowCount: 1
        })
        .mockResolvedValueOnce({ // UPDATE trip to PAUSED
          rows: [{ id: 'trip-123', status: 'PAUSED' }],
          rowCount: 1
        })
        .mockResolvedValueOnce(); // COMMIT

      const response = await request(app)
        .post('/v1/trips/550e8400-e29b-41d4-a716-446655440000/pause');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('PAUSED');
    });

    it('should fail if trip cannot be paused', async () => {
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // SELECT trip - not found

      const response = await request(app)
        .post('/v1/trips/550e8400-e29b-41d4-a716-446655440000/pause');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });
});
