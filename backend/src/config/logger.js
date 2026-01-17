const pino = require('pino');
const newrelic = require('newrelic');

// Create Pino logger with New Relic integration
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  
  // Format for local development
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined,

  // Add New Relic context to logs
  formatters: {
    log(object) {
      const newRelicContext = newrelic.getLinkingMetadata();
      return { ...object, ...newRelicContext };
    }
  },

  // Base configuration
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || 'localhost',
    environment: process.env.NODE_ENV || 'development'
  }
});

// Override console methods to use Pino (so all console.log goes to New Relic)
if (process.env.NEW_RELIC_ENABLED !== 'false') {
  console.log = (...args) => logger.info(args.join(' '));
  console.error = (...args) => logger.error(args.join(' '));
  console.warn = (...args) => logger.warn(args.join(' '));
  console.info = (...args) => logger.info(args.join(' '));
  console.debug = (...args) => logger.debug(args.join(' '));
}

module.exports = logger;
