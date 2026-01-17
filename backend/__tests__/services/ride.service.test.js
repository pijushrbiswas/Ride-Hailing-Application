/**
 * Unit tests for ride service
 */

const rideService = require('../../src/services/ride.service');
const matchingService = require('../../src/services/matching.service');
const db = require('../../src/db');

jest.mock('../../src/db');
jest.mock('../../src/services/matching.service');

describe('Ride Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createRide', () => {
    it('should create a ride successfully', async () => {
      const mockRide = {
        id: 'ride-123',
        rider_id: 'rider-1',
        pickup_latitude: 37.7749,
        pickup_longitude: -122.4194,
        drop_latitude: 37.8049,
        drop_longitude: -122.4294,
        tier: 'ECONOMY',
        payment_method: 'CARD',
        status: 'MATCHING'
      };

      const mockDrivers = [
        { id: 'driver-1', distance: '2.3km' },
        { id: 'driver-2', distance: '3.1km' }
      ];

      db.query.mockResolvedValue({ rows: [mockRide] });
      matchingService.findNearbyDrivers.mockResolvedValue(mockDrivers);

      const result = await rideService.createRide({
        rider_id: 'rider-1',
        pickup_latitude: 37.7749,
        pickup_longitude: -122.4194,
        drop_latitude: 37.8049,
        drop_longitude: -122.4294
      });

      expect(result.ride).toEqual(mockRide);
      expect(result.candidate_drivers).toEqual(mockDrivers);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO rides'),
        expect.arrayContaining([
          'rider-1',
          37.7749,
          -122.4194,
          37.8049,
          -122.4294,
          'ECONOMY',
          'CARD'
        ])
      );
    });

    it('should use custom tier and payment method', async () => {
      const mockRide = { id: 'ride-123', tier: 'LUXURY', payment_method: 'CASH' };
      db.query.mockResolvedValue({ rows: [mockRide] });
      matchingService.findNearbyDrivers.mockResolvedValue([]);

      await rideService.createRide({
        rider_id: 'rider-1',
        pickup_latitude: 37.7749,
        pickup_longitude: -122.4194,
        drop_latitude: 37.8049,
        drop_longitude: -122.4294,
        tier: 'LUXURY',
        payment_method: 'CASH'
      });

      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['LUXURY', 'CASH'])
      );
    });
  });

  describe('getRide', () => {
    it('should return ride if found', async () => {
      const mockRide = { id: 'ride-123', status: 'MATCHING' };
      db.query.mockResolvedValue({ rows: [mockRide], rowCount: 1 });

      const result = await rideService.getRide('ride-123');

      expect(result).toEqual(mockRide);
      expect(db.query).toHaveBeenCalledWith(
        'SELECT * FROM rides WHERE id = $1',
        ['ride-123']
      );
    });

    it('should throw error if ride not found', async () => {
      db.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(rideService.getRide('invalid-id')).rejects.toThrow('Ride not found');
    });
  });
});
