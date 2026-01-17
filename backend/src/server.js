require('newrelic'); // must be first (safe even if disabled)
require('dotenv').config();

const http = require('http');
const app = require('./app');
const logger = require('./config/logger');
const wsManager = require('./utils/websocket');
const matchingWorker = require('./workers/matching.worker');
const outboxWorker = require('./workers/outbox.worker');

const PORT = process.env.PORT || 3000;

// IMPORTANT: bind to 0.0.0.0, not localhost
const server = http.createServer(app);

// Initialize WebSocket server
wsManager.initialize(server);

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Server listening on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`New Relic enabled: ${process.env.NEW_RELIC_ENABLED !== 'false'}`);
  logger.info(`WebSocket server ready on ws://localhost:${PORT}`);
  
  // Start background workers
  logger.info('Starting background workers...');
  matchingWorker.start();
  outboxWorker.start();
  logger.info('✓ Background workers started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  matchingWorker.stop();
  outboxWorker.stop();
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  matchingWorker.stop();
  outboxWorker.stop();
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});