const newrelic = require('newrelic');
const logger = require('../config/logger');

/**
 * Custom error class for application errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;

  // Log error
  console.error('Error:', err.message, err.stack);
  logger.error({
    err,
    path: req.path,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query
  }, 'Request error');

  // Report to New Relic
  newrelic.noticeError(err, {
    path: req.path,
    method: req.method,
    statusCode: error.statusCode
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    error.message = Object.values(err.errors).map(e => e.message).join(', ');
    error.statusCode = 400;
  }

  // Postgres duplicate key error
  if (err.code === '23505') {
    error.message = 'Duplicate entry found';
    error.statusCode = 409;
  }

  // Postgres foreign key violation
  if (err.code === '23503') {
    error.message = 'Referenced record not found';
    error.statusCode = 404;
  }

  // Postgres not null violation
  if (err.code === '23502') {
    error.message = 'Required field missing';
    error.statusCode = 400;
  }

  // Postgres check constraint violation
  if (err.code === '23514') {
    error.message = 'Invalid value provided';
    error.statusCode = 400;
  }

  // Custom application errors with specific messages
  if (err.message === 'Trip not found or already started') {
    error.statusCode = 409;
  }
  if (err.message === 'Payment not found') {
    error.statusCode = 404;
  }
  if (err.message === 'Ride not found') {
    error.statusCode = 404;
  }
  if (err.message === 'Driver not found') {
    error.statusCode = 404;
  }
  if (err.message.includes('not found')) {
    error.statusCode = 404;
  }
  if (err.message.includes('Max retries exceeded')) {
    error.statusCode = 422;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token';
    error.statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired';
    error.statusCode = 401;
  }

  // Send response
  res.status(error.statusCode).json({
    success: false,
    error: error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Export both the error handler and AppError class
module.exports = errorHandler;
module.exports.AppError = AppError;
module.exports.AppError = AppError;