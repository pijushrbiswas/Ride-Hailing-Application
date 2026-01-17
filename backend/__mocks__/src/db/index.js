/**
 * Mock for database utility module
 */

const mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn()
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

const getClient = jest.fn(async () => mockClient);

module.exports = {
  query: mockPool.query,
  getClient,
  pool: mockPool,
  __mockClient: mockClient,
  __mockPool: mockPool
};
