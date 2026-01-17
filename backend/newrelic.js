'use strict';

exports.config = {
  enabled: process.env.NEW_RELIC_ENABLED !== 'false',

  app_name: ['ride-hailing-backend'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY || 'dummy',

  distributed_tracing: {
    enabled: true
  },

  logging: {
    level: 'info',
    filepath: 'stdout'
  },

  // Enable application logging to send logs to New Relic
  application_logging: {
    enabled: true,
    forwarding: {
      enabled: true,
      max_samples_stored: 10000
    },
    metrics: {
      enabled: true
    },
    local_decorating: {
      enabled: true
    }
  }
};