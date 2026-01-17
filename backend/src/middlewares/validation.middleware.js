/**
 * Request validation middleware
 * Validates and sanitizes incoming request data
 */

const { AppError } = require('./error.middleware');

/**
 * Validate ride creation request
 */
exports.validateCreateRide = (req, res, next) => {
  const { rider_id, pickup_latitude, pickup_longitude, drop_latitude, drop_longitude, tier, payment_method } = req.body;

  const errors = [];

  // Required fields
  if (!rider_id) errors.push('rider_id is required');
  if (pickup_latitude === undefined) errors.push('pickup_latitude is required');
  if (pickup_longitude === undefined) errors.push('pickup_longitude is required');
  if (drop_latitude === undefined) errors.push('drop_latitude is required');
  if (drop_longitude === undefined) errors.push('drop_longitude is required');

  // Validate latitude/longitude ranges
  if (pickup_latitude < -90 || pickup_latitude > 90) {
    errors.push('pickup_latitude must be between -90 and 90');
  }
  if (pickup_longitude < -180 || pickup_longitude > 180) {
    errors.push('pickup_longitude must be between -180 and 180');
  }
  if (drop_latitude < -90 || drop_latitude > 90) {
    errors.push('drop_latitude must be between -90 and 90');
  }
  if (drop_longitude < -180 || drop_longitude > 180) {
    errors.push('drop_longitude must be between -180 and 180');
  }

  // Validate tier
  if (tier && !['ECONOMY', 'PREMIUM', 'LUXURY'].includes(tier)) {
    errors.push('tier must be ECONOMY, PREMIUM, or LUXURY');
  }

  // Validate payment method
  if (payment_method && !['CARD', 'CASH', 'WALLET', 'UPI'].includes(payment_method)) {
    errors.push('payment_method must be CARD, CASH, WALLET, or UPI');
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join(', '), 400));
  }

  next();
};

/**
 * Validate driver location update
 */
exports.validateLocationUpdate = (req, res, next) => {
  const { latitude, longitude } = req.body;
  const { id } = req.params;

  const errors = [];

  if (!id) errors.push('driver id is required');
  if (latitude === undefined) errors.push('latitude is required');
  if (longitude === undefined) errors.push('longitude is required');

  if (latitude < -90 || latitude > 90) {
    errors.push('latitude must be between -90 and 90');
  }
  if (longitude < -180 || longitude > 180) {
    errors.push('longitude must be between -180 and 180');
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join(', '), 400));
  }

  next();
};

/**
 * Validate driver accept ride
 */
exports.validateAcceptRide = (req, res, next) => {
  const { ride_id } = req.body;
  const { id } = req.params;

  const errors = [];

  if (!id) errors.push('driver id is required');
  if (!ride_id) errors.push('ride_id is required');

  if (errors.length > 0) {
    return next(new AppError(errors.join(', '), 400));
  }

  next();
};

/**
 * Validate trip end request
 */
exports.validateEndTrip = (req, res, next) => {
  const { distance_km, duration_sec } = req.body;

  const errors = [];

  if (distance_km !== undefined && (distance_km < 0 || distance_km > 1000)) {
    errors.push('distance_km must be between 0 and 1000');
  }

  if (duration_sec !== undefined && (duration_sec < 0 || duration_sec > 86400)) {
    errors.push('duration_sec must be between 0 and 86400 (24 hours)');
  }

  if (errors.length > 0) {
    return next(new AppError(errors.join(', '), 400));
  }

  next();
};

/**
 * Validate payment creation
 */
exports.validateCreatePayment = (req, res, next) => {
  const { trip_id } = req.body;

  if (!trip_id) {
    return next(new AppError('trip_id is required', 400));
  }

  next();
};

/**
 * Validate UUID format
 */
exports.validateUUID = (paramName) => (req, res, next) => {
  const id = req.params[paramName];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!id || !uuidRegex.test(id)) {
    return next(new AppError(`Invalid ${paramName} format`, 400));
  }

  next();
};
