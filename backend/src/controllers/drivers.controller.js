const service = require('../services/driver.service');
const assignmentService = require('../services/assignment.service');
const db = require('../db');
const logger = require('../config/logger');

exports.createDriver = async (req, res, next) => {
  try {
    const driver = await service.createDriver(req.body);
    res.status(201).json(driver);
  } catch (e) {
    logger.error({ error: e.message }, 'Failed to create driver');
    next(e);
  }
};

exports.getAllDrivers = async (req, res, next) => {
  try {
    const { status, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM drivers';
    const params = [];
    
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    
    const result = await db.query(query, params);
    logger.info({ count: result.rowCount }, 'Retrieved drivers list');
    res.json(result.rows);
  } catch (e) {
    logger.error({ error: e.message }, 'Failed to get drivers');
    next(e);
  }
};

exports.updateLocation = async (req, res, next) => {
  try {
    const updatedData = await service.updateLocation(req.params.id, req.body);
    res.status(200).json(updatedData);
  } catch (e) {
    next(e);
  }
};

exports.acceptRide = async (req, res, next) => {
  try {
    const driverId = req.params.id;
    const { ride_id } = req.body;
    
    if (!ride_id) {
      return res.status(400).json({ error: 'ride_id is required' });
    }
    
    const tripData = await assignmentService.initializeTrip(
      ride_id,
      driverId
    );
    
    // Broadcast trip accepted event with details
    const wsManager = require('../utils/websocket');
    wsManager.broadcastTripAccepted({
      trip: tripData.trip,
      driver: tripData.driver
    });
    
    logger.info(
      { tripId: tripData.trip.id, rideId: ride_id, driverId },
      'Trip accepted and initialized successfully'
    );
    
    // Combine results for response
    res.json({
      success: true,
      trip: tripData.trip,
      driver: tripData.driver
    });
  } catch (e) {
    logger.error({ error: e.message, driverId: req.params.id, rideId: req.body.ride_id }, 'Failed to accept ride');
    next(e);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const driverId = req.params.id;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }
    
    if (!['OFFLINE', 'AVAILABLE', 'ON_TRIP'].includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status. Must be OFFLINE, AVAILABLE, or ON_TRIP' 
      });
    }
    
    const result = await driverService.updateDriverStatus(driverId, status);
    res.json(result);
  } catch (e) {
    next(e);
  }
};