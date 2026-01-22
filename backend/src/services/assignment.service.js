const db = require('../db');
const notificationService = require('./notification.service');
const wsManager = require('../utils/websocket');
const newrelic = require('newrelic');
const { invalidateDriverCache } = require('../utils/redis');
const {
  RIDE_STATES,
  DRIVER_STATES,
  validateRideTransition,
  validateDriverTransition,
  canAssignRide,
  canAcceptTrip,
  StateTransitionError
} = require('../utils/stateMachine');

/**
 * Initialize trip by updating driver status and creating trip entry
 * Used in accept endpoint flow after driver state validation
 * @param {string} rideId - ID of the ride
 * @param {string} driverId - ID of the driver
 * @returns {object} { driver: updatedDriver, trip: tripData }
 */
exports.initializeTrip = async (rideId, driverId) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    // Update driver status to ON_TRIP
    const driverUpdate = await client.query(
      `UPDATE drivers
       SET status=$1,
           updated_at=now()
       WHERE id=$2 AND status=$3
       RETURNING *`,
      [DRIVER_STATES.ON_TRIP, driverId, DRIVER_STATES.AVAILABLE]
    );

    if (driverUpdate.rowCount === 0) {
      throw new Error('Driver not available for assignment');
    }

    const updatedDriver = driverUpdate.rows[0];

    // Create trip in CREATED state
    const tripResult = await client.query(
      `INSERT INTO trips (ride_id, driver_id, status)
       VALUES ($1, $2, 'CREATED')
       RETURNING *`,
      [rideId, driverId]
    );

    await client.query('COMMIT');

    // Invalidate driver cache when status changes
    await invalidateDriverCache(driverId);

    wsManager.broadcastDriverStatusChanged(updatedDriver);

    return { 
      driver: updatedDriver, 
      trip: tripResult.rows[0] 
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
};

exports.assignDriver = async (rideId, driverId) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Get ride and driver with locks
    const ride = await client.query(
      `SELECT r.*, d.name as driver_name, d.phone as driver_phone, 
              d.rating as driver_rating, d.status as driver_status
       FROM rides r, drivers d
       WHERE r.id=$1 AND d.id=$2
       FOR UPDATE OF r, d`,
      [rideId, driverId]
    );

    if (!ride.rows.length) {
      throw new Error('Ride or driver not found');
    }

    const rideData = ride.rows[0];

    // Validate ride state transition
    if (!canAssignRide(rideData.status)) {
      throw new StateTransitionError(
        `Cannot assign driver to ride in ${rideData.status} state`,
        rideData.status,
        RIDE_STATES.DRIVER_ASSIGNED,
        'Ride'
      );
    }
    
    validateRideTransition(rideData.status, RIDE_STATES.DRIVER_ASSIGNED);

    // Validate driver state transition
    if (!canAcceptTrip(rideData.driver_status)) {
      throw new StateTransitionError(
        `Driver cannot accept trip in ${rideData.driver_status} state`,
        rideData.driver_status,
        DRIVER_STATES.ON_TRIP,
        'Driver'
      );
    }
    
    validateDriverTransition(rideData.driver_status, DRIVER_STATES.ON_TRIP);

    // Update ride status to DRIVER_ASSIGNED
    const rideUpdate = await client.query(
      `UPDATE rides
       SET status=$1,
           assigned_driver_id=$2,
           assigned_at=now(),
           updated_at=now()
       WHERE id=$3
       RETURNING *`,
      [RIDE_STATES.DRIVER_ASSIGNED, driverId, rideId]
    );

    await client.query('COMMIT');

    // Broadcast events
    wsManager.broadcastDriverAssigned(rideId, driverId, rideData.driver_name);
    wsManager.broadcastRideUpdated(rideUpdate.rows[0]);

    // Send notification to rider
    await notificationService.notifyRideAssigned(rideData.rider_id, {
      ride_id: rideId,
      driver_name: rideData.driver_name,
      driver_phone: rideData.driver_phone,
      driver_rating: rideData.driver_rating,
      eta_minutes: 5
    });

    newrelic.recordMetric('Custom/Assignment/Success', 1);

    return { 
      success: true,
      ride: rideUpdate.rows[0],
      driver: rideData
    };
  } catch (e) {
    await client.query('ROLLBACK');
    newrelic.noticeError(e, { context: 'assignDriver', rideId, driverId });
    throw e;
  } finally {
    client.release();
  }
};