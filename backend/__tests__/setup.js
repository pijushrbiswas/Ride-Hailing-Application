/**
 * Test setup file
 * Runs before all tests
 */

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'rides_test';
process.env.DB_USER = 'testuser';
process.env.DB_PASSWORD = 'testpass';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.NEW_RELIC_ENABLED = 'false';

// Global test timeout
jest.setTimeout(15000);

// Mock New Relic
jest.mock('newrelic', () => ({
  recordMetric: jest.fn(),
  addCustomAttribute: jest.fn(),
  noticeError: jest.fn()
}));

// Mock logger
jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Enable manual mocks for Redis and DB
jest.mock('../src/utils/redis');
jest.mock('../src/db');
