/**
 * Test app instance with mocked dependencies
 * Use this instead of importing app.js directly in API tests
 */

// Mock dependencies before requiring app
jest.mock('../../src/db');
jest.mock('../../src/utils/redis');
jest.mock('../../src/services/notification.service');

const app = require('../../src/app');

module.exports = app;
