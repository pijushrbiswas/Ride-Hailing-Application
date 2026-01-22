/**
 * Integration tests for drivers API
 */

const request = require('supertest');
const db = require('../../src/db');
const redis = require('../../src/utils/redis');

jest.mock('../../src/db');
jest.mock('../../src/utils/redis', () => ({
  geoAdd: jest.fn(),
  expire: jest.fn(),
  invalidateDriverCache: jest.fn().mockResolvedValue(undefined),
  removeDriverFromGeo: jest.fn().mockResolvedValue(undefined),
  CACHE_TTL: {
    DRIVER_LOCATION: 60,
    RIDE_DATA: 300,
    DRIVER_STATUS: 120
  }
}));
jest.mock('../../src/services/notification.service', () => ({
  notifyRideAssigned: jest.fn().mockResolvedValue(true)
}));
jest.mock('../../src/utils/websocket', () => ({
  broadcastRideCreated: jest.fn(),
  broadcastRideUpdated: jest.fn(),
  broadcastDriverAssigned: jest.fn(),
  broadcastTripAccepted: jest.fn(),
  broadcastLocationUpdate: jest.fn(),
  broadcastDriverStatusChanged: jest.fn()
}));

// Import app AFTER mocks
const app = require('../../src/app');

describe('Drivers API', () => {
  describe('POST /v1/drivers/:id/accept', () => {
    it('should accept ride assignment', async () => {
      const mockClient = {
        query: jest.fn()
          // initializeTrip() calls
          .mockResolvedValueOnce() // initializeTrip: BEGIN
          .mockResolvedValueOnce({ // initializeTrip: UPDATE driver
            rows: [{
              id: '550e8400-e29b-41d4-a716-446655440000',
              status: 'ON_TRIP'
            }],
            rowCount: 1
          })
          .mockResolvedValueOnce({ // initializeTrip: INSERT trip
            rows: [{
              id: '750e8400-e29b-41d4-a716-446655440001',
              ride_id: '650e8400-e29b-41d4-a716-446655440000',
              driver_id: '550e8400-e29b-41d4-a716-446655440000',
              status: 'CREATED'
            }],
            rowCount: 1
          })
          .mockResolvedValueOnce(), // initializeTrip: COMMIT
        release: jest.fn()
      };

      db.getClient.mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/v1/drivers/550e8400-e29b-41d4-a716-446655440000/accept')
        .send({
          ride_id: '650e8400-e29b-41d4-a716-446655440000'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.trip.status).toBe('CREATED');
      expect(response.body.driver.status).toBe('ON_TRIP');
    });

    it('should reject missing ride_id', async () => {
      const response = await request(app)
        .post('/v1/drivers/550e8400-e29b-41d4-a716-446655440000/accept')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('ride_id');
    });
  });

  describe('POST /v1/drivers/:id/location', () => {
    it('should update driver location successfully', async () => {
      db.query.mockResolvedValue({ rowCount: 1 });
      redis.geoAdd.mockResolvedValue(1);
      redis.expire.mockResolvedValue(1);

      const response = await request(app)
        .post('/v1/drivers/550e8400-e29b-41d4-a716-446655440000/location')
        .send({
          latitude: 37.7749,
          longitude: -122.4194
        });

      expect(response.status).toBe(200);
      expect(redis.geoAdd).toHaveBeenCalledWith('drivers:geo', {
        longitude: -122.4194,
        latitude: 37.7749,
        member: '550e8400-e29b-41d4-a716-446655440000'
      });
    });

    it('should reject invalid coordinates', async () => {
      const response = await request(app)
        .post('/v1/drivers/550e8400-e29b-41d4-a716-446655440000/location')
        .send({
          latitude: 200,
          longitude: -122.4194
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('latitude');
    });

    it('should respect rate limiting', async () => {
      db.query.mockResolvedValue({ rowCount: 1 });
      redis.geoAdd.mockResolvedValue(1);

      const driverId = '550e8400-e29b-41d4-a716-446655440000';

      // Send 121 requests (limit is 120/min)
      const requests = [];
      for (let i = 0; i < 121; i++) {
        requests.push(
          request(app)
            .post(`/v1/drivers/${driverId}/location`)
            .send({ latitude: 37.7749, longitude: -122.4194 })
        );
      }

      const responses = await Promise.all(requests);
      const tooManyRequests = responses.filter(r => r.status === 429);

      expect(tooManyRequests.length).toBeGreaterThan(0);
    });
  });
});
