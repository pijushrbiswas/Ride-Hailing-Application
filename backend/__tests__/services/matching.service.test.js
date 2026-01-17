/**
 * Unit tests for matching service with Redis geospatial search
 */

const matchingService = require('../../src/services/matching.service');
const redis = require('../../src/utils/redis');

jest.mock('../../src/utils/redis');

describe('Matching Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findNearbyDrivers', () => {
    it('should find drivers within 5km radius', async () => {
      const mockDrivers = [
        { member: 'driver-1', distance: '2.3' },
        { member: 'driver-2', distance: '4.1' }
      ];

      redis.geoSearch.mockResolvedValue(mockDrivers);

      const result = await matchingService.findNearbyDrivers(37.7749, -122.4194);

      expect(result).toEqual([
        { member: 'driver-1', distance: '2.3' },
        { member: 'driver-2', distance: '4.1' }
      ]);

      expect(redis.geoSearch).toHaveBeenCalledWith(
        'drivers:geo',
        { longitude: -122.4194, latitude: 37.7749 },
        { radius: 5, unit: 'km' },
        { SORT: 'ASC', COUNT: 5 }
      );
    });

    it('should return empty array if no drivers found', async () => {
      redis.geoSearch.mockResolvedValue([]);

      const result = await matchingService.findNearbyDrivers(37.7749, -122.4194);

      expect(result).toEqual([]);
    });

    it('should handle Redis errors gracefully', async () => {
      redis.geoSearch.mockRejectedValue(new Error('Redis connection error'));

      await expect(matchingService.findNearbyDrivers(37.7749, -122.4194)).rejects.toThrow('Redis connection error');
    });
  });
});
