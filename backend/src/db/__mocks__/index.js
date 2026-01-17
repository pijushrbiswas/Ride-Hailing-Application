/**
 * Mock database connection for tests
 */

const mockClient = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  release: jest.fn()
};

const dbMock = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  getClient: jest.fn().mockResolvedValue(mockClient)
};

module.exports = dbMock;
