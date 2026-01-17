const service = require('../services/ride.service');
const tripService = require('../services/trip.service');
const matchingWorker = require('../workers/matching.worker');
const logger = require('../config/logger');
const db = require('../db');

exports.createRide = async (req, res, next) => {
  try {
    logger.info({ body: req.body }, 'Creating new ride');
    const result = await service.createRide(req.body);
    logger.info({ rideId: result.ride.id }, 'Ride created successfully');
    res.status(201).json(result);
  } catch (e) {
    logger.error({ error: e.message, body: req.body }, 'Failed to create ride');
    next(e);
  }
};

exports.getRide = async (req, res, next) => {
  try {
    const trip = await tripService.getTripByRideId(req.params.id);
    logger.info({ rideId: req.params.id }, 'Trip retrieved for ride');
    res.json(trip);
  } catch (e) {
    logger.error({ error: e.message, rideId: req.params.id }, 'Failed to get trip for ride');
    next(e);
  }
};

exports.getAllRides = async (req, res, next) => {
  try {
    const { status, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM rides';
    const params = [];
    
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    
    const result = await db.query(query, params);
    logger.info({ count: result.rowCount }, 'Retrieved rides list');
    res.json(result.rows);
  } catch (e) {
    logger.error({ error: e.message }, 'Failed to get rides');
    next(e);
  }
};

exports.retryMatching = async (req, res, next) => {
  try {
    const rideId = req.params.id;
    
    logger.info({ rideId }, 'Manually triggering driver matching');
    
    const result = await matchingWorker.matchRide(rideId);
    
    if (result) {
      logger.info({ rideId, tripId: result.trip.id }, 'Driver successfully assigned');
      res.json({
        success: true,
        message: 'Driver assigned successfully',
        ride: result.ride,
        trip: result.trip
      });
    } else {
      logger.warn({ rideId }, 'No available drivers found');
      res.status(404).json({
        success: false,
        message: 'No available drivers found nearby'
      });
    }
  } catch (e) {
    logger.error({ error: e.message, rideId: req.params.id }, 'Failed to retry matching');
    next(e);
  }
};