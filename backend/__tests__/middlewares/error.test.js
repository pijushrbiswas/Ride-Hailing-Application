/**
 * Unit tests for error middleware
 */

const errorHandler = require('../../src/middlewares/error.middleware');
const newrelic = require('newrelic');

jest.mock('newrelic');

describe('Error Middleware', () => {
  let req, res, next, consoleErrorSpy;

  beforeEach(() => {
    req = { 
      method: 'GET', 
      path: '/test',
      url: '/test',
      body: {},
      params: {},
      query: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    
    // Mock console.error to avoid cluttering test output
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  it('should handle AppError with custom status code', () => {
    const { AppError } = require('../../src/middlewares/error.middleware');
    const error = new AppError('Bad request', 400);

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Bad request'
      })
    );
  });

  it('should handle duplicate key Postgres errors', () => {
    const error = {
      code: '23505',
      message: 'duplicate key value violates unique constraint'
    };

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Duplicate entry found'
      })
    );
  });

  it('should handle foreign key Postgres errors', () => {
    const error = {
      code: '23503',
      message: 'foreign key constraint violation'
    };

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Referenced record not found'
      })
    );
  });

  it('should handle generic errors with 500 status', () => {
    const error = new Error('Something went wrong');

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Something went wrong'
      })
    );
    expect(newrelic.noticeError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        path: '/test',
        method: 'GET'
      })
    );
  });

  it('should log error details to console', () => {
    const error = new Error('Test error');

    errorHandler(error, req, res, next);

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should handle JWT errors', () => {
    const error = new Error('Invalid token');
    error.name = 'JsonWebTokenError';

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Invalid token'
      })
    );
  });

  it('should handle expired token errors', () => {
    const error = new Error('Token expired');
    error.name = 'TokenExpiredError';

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Token expired'
      })
    );
  });
});
