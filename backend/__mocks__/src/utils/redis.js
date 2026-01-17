/**
 * Mock for Redis utility module
 * This ensures consistent mocking across all tests
 */

const { mockClient } = require('@redis/client');

// Export mock functions
module.exports = {
  ...mockClient,
  invalidateDriverCache: jest.fn().mockResolvedValue(undefined),
  invalidateRideCache: jest.fn().mockResolvedValue(undefined),
  removeDriverFromGeo: jest.fn().mockResolvedValue(undefined),
  getCachedDriver: jest.fn().mockResolvedValue(null),
  setCachedDriver: jest.fn().mockResolvedValue(undefined),
  getCachedRide: jest.fn().mockResolvedValue(null),
  setCachedRide: jest.fn().mockResolvedValue(undefined),
  CACHE_TTL: {
    DRIVER_LOCATION: 60,
    RIDE_DATA: 300,
    DRIVER_STATUS: 120
  }
};
