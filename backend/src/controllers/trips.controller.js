const service = require('../services/trip.service');

/**
 * Start a trip
 */
exports.startTrip = async (req, res, next) => {
  try {
    const trip = await service.startTrip(req.params.id);
    res.json(trip);
  } catch (e) {
    next(e);
  }
};

/**
 * Pause a trip
 */
exports.pauseTrip = async (req, res, next) => {
  try {
    const trip = await service.pauseTrip(req.params.id);
    res.json(trip);
  } catch (e) {
    next(e);
  }
};

/**
 * End a trip with optional distance/duration data
 */
exports.endTrip = async (req, res, next) => {
  try {
    const trip = await service.endTrip(req.params.id, req.body);
    res.json(trip);
  } catch (e) {
    next(e);
  }
};

/**
 * Get trip receipt
 */
exports.getReceipt = async (req, res, next) => {
  try {
    const receipt = await service.getTripReceipt(req.params.id);
    res.json(receipt);
  } catch (e) {
    next(e);
  }
};

/**
 * Get trip by driver ID and ride ID
 */
exports.getTripByDriverAndRide = async (req, res, next) => {
  try {
    const { driverId, rideId } = req.params;
    const trip = await service.getTripByDriverAndRide(driverId, rideId);
    res.json(trip);
  } catch (e) {
    next(e);
  }
};