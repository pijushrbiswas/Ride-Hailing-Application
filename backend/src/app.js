const express = require('express');
const errorMiddleware = require('./middlewares/error.middleware');
const { securityHeaders, corsConfig, sanitizeInput, apiLimiter } = require('./middlewares/security.middleware');

const ridesRoutes = require('./routes/rides');
const driversRoutes = require('./routes/drivers');
const tripsRoutes = require('./routes/trips');
const paymentRoutes = require('./routes/payments');
const swaggerUi = require('swagger-ui-express');
const swaggerDoc = require('../swagger.json');

const app = express();

// Security middleware
app.use(securityHeaders);
app.use(corsConfig);
app.use(express.json({ limit: '10kb' })); // Limit body size
app.use(sanitizeInput);

// Rate limiting (except health check)
app.use('/v1', apiLimiter);

// Routes
app.use('/v1/payments', paymentRoutes);
app.use('/v1/rides', ridesRoutes);
app.use('/v1/drivers', driversRoutes);
app.use('/v1/trips', tripsRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));

// Health check (no rate limit)
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler (must be last)
app.use(errorMiddleware);

module.exports = app;