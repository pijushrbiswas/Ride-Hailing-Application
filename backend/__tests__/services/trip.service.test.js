/**
 * Unit tests for trip service fare calculation
 */

const tripService = require('../../src/services/trip.service');
const db = require('../../src/db');
const notificationService = require('../../src/services/notification.service');
const { invalidateDriverCache } = require('../../src/utils/redis');
const wsManager = require('../../src/utils/websocket');

jest.mock('../../src/db');
jest.mock('../../src/services/notification.service');
jest.mock('../../src/utils/redis');
jest.mock('../../src/utils/websocket');

describe('Trip Service', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    db.getClient = jest.fn().mockResolvedValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startTrip', () => {
    it('should start a trip successfully', async () => {
      const tripData = {
        id: 'trip-123',
        ride_id: 'ride-123',
        tier: 'ECONOMY',
        surge_multiplier: 1.0,
        rider_id: 'rider-1',
        status: 'CREATED'
      };

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [tripData], rowCount: 1 }) // SELECT
        .mockResolvedValueOnce({ rows: [{ ...tripData, status: 'STARTED' }] }) // UPDATE
        .mockResolvedValueOnce(); // COMMIT

      notificationService.notifyTripStarted.mockResolvedValue();

      const result = await tripService.startTrip('trip-123');

      expect(result.status).toBe('STARTED');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(notificationService.notifyTripStarted).toHaveBeenCalledWith('rider-1', expect.any(Object));
    });

    it('should rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(tripService.startTrip('trip-123')).rejects.toThrow('Database error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('endTrip with fare calculation', () => {
    it('should calculate ECONOMY fare correctly', async () => {
      const tripData = {
        id: 'trip-123',
        ride_id: 'ride-123',
        tier: 'ECONOMY',
        surge_multiplier: 1.0,
        rider_id: 'rider-1',
        driver_id: 'driver-1',
        status: 'STARTED',
        started_at: new Date('2026-01-15T10:00:00Z')
      };

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [tripData], rowCount: 1 }) // SELECT trip
        .mockResolvedValueOnce({ // UPDATE trip
          rows: [{
            ...tripData,
            status: 'ENDED',
            distance_km: 10,
            duration_sec: 1200,
            base_fare: 25.00,
            total_fare: 25.00
          }]
        })
        .mockResolvedValueOnce({ rows: [{ id: 'driver-1', status: 'AVAILABLE' }], rowCount: 1 }) // UPDATE driver
        .mockResolvedValueOnce({ rows: [{ id: 'ride-123', status: 'COMPLETED' }], rowCount: 1 }) // UPDATE ride
        .mockResolvedValueOnce(); // COMMIT

      notificationService.notifyTripEnded.mockResolvedValue();

      const result = await tripService.endTrip('trip-123', {
        distance_km: 10,
        duration_sec: 1200 // 20 minutes
      });

      // ECONOMY: base=5, per_km=1.5, per_min=0.25
      // Base: 5, Distance: 10*1.5=15, Time: 1200/60*0.25=5, Surge: 1.0
      // Total: (5+15+5)*1.0 = 25
      expect(result.base_fare).toBe(25.00);
      expect(result.total_fare).toBe(25.00);
      expect(result.fare_breakdown).toBeDefined();
    });

    it('should apply surge multiplier correctly', async () => {
      const tripData = {
        id: 'trip-123',
        tier: 'ECONOMY',
        surge_multiplier: 2.0,
        rider_id: 'rider-1',
        driver_id: 'driver-1',
        ride_id: 'ride-123',
        status: 'STARTED'
      };

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [tripData], rowCount: 1 }) // SELECT
        .mockResolvedValueOnce({ // UPDATE trip
          rows: [{
            base_fare: 25.00,
            total_fare: 50.00 // (5 + 15 + 5) * 2.0 = 50
          }]
        })
        .mockResolvedValueOnce({ rows: [{ id: 'driver-1', status: 'AVAILABLE' }], rowCount: 1 }) // UPDATE driver
        .mockResolvedValueOnce({ rows: [{ id: 'ride-123', status: 'COMPLETED' }], rowCount: 1 }) // UPDATE ride
        .mockResolvedValueOnce(); // COMMIT

      notificationService.notifyTripEnded.mockResolvedValue();

      const result = await tripService.endTrip('trip-123', {
        distance_km: 10,
        duration_sec: 1200
      });

      expect(result.total_fare).toBe(50.00);
    });
  });

  describe('pauseTrip', () => {
    it('should pause a running trip', async () => {
      const tripData = {
        id: 'trip-123',
        status: 'STARTED'
      };

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [tripData], rowCount: 1 }) // SELECT for lock
        .mockResolvedValueOnce({ // UPDATE
          rows: [{ id: 'trip-123', status: 'PAUSED' }],
          rowCount: 1
        })
        .mockResolvedValueOnce(); // COMMIT

      const result = await tripService.pauseTrip('trip-123');

      expect(result.status).toBe('PAUSED');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw error if trip cannot be paused', async () => {
      const tripData = {
        id: 'trip-123',
        status: 'ENDED' // Cannot pause an ended trip
      };

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [tripData], rowCount: 1 }); // SELECT

      await expect(tripService.pauseTrip('trip-123')).rejects.toThrow();
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
});
