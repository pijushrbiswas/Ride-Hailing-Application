/**
 * Mock Redis client for tests
 */

const redisMock = {
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
  geoAdd: jest.fn().mockResolvedValue(1),
  geoSearch: jest.fn().mockResolvedValue([]),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  invalidateDriverCache: jest.fn().mockResolvedValue(undefined),
  invalidateRideCache: jest.fn().mockResolvedValue(undefined),
  getCachedDriver: jest.fn().mockResolvedValue(null),
  setCachedDriver: jest.fn().mockResolvedValue(undefined),
  getCachedRide: jest.fn().mockResolvedValue(null),
  setCachedRide: jest.fn().mockResolvedValue(undefined)
};

module.exports = redisMock;
