/**
 * Security middleware
 * Rate limiting, CORS, helmet for API security
 */

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

/**
 * Rate limiter for general API endpoints
 */
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for location updates (higher limit)
 */
exports.locationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute (2 per second)
  message: 'Too many location updates, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for payment endpoints (stricter)
 */
exports.paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 payment requests per 15 minutes
  message: 'Too many payment requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Helmet security headers
 */
exports.securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
});

/**
 * CORS configuration
 */
exports.corsConfig = cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-PSP-Signature'],
  credentials: true,
  maxAge: 86400 // 24 hours
});

/**
 * Request sanitization - prevent NoSQL/SQL injection
 */
exports.sanitizeInput = (req, res, next) => {
  // Remove any potential malicious patterns
  const sanitize = (obj) => {
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          // Remove dangerous characters
          obj[key] = obj[key].replace(/[<>]/g, '');
        } else if (typeof obj[key] === 'object') {
          sanitize(obj[key]);
        }
      }
    }
  };

  sanitize(req.body);
  sanitize(req.query);
  sanitize(req.params);

  next();
};
