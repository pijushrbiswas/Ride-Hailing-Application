const db = require('../db');
const newrelic = require('newrelic');
const notificationService = require('./notification.service');
const wsManager = require('../utils/websocket');
const { invalidateDriverCache } = require('../utils/redis');
const {
  TRIP_STATES,
  validateTripTransition,
  canStartTrip,
  canPauseTrip,
  canEndTrip,
  canCancelTrip,
  StateTransitionError
} = require('../utils/stateMachine');

// Fare calculation based on tier
const TIER_RATES = {
  ECONOMY: { base: 5.0, per_km: 1.5, per_min: 0.25 },
  PREMIUM: { base: 8.0, per_km: 2.5, per_min: 0.40 },
  LUXURY: { base: 15.0, per_km: 4.0, per_min: 0.60 }
};

/**
 * Calculate fare based on distance, duration, and tier
 */
function calculateFare(distanceKm, durationSec, tier, surgeMultiplier = 1.0) {
  const rates = TIER_RATES[tier] || TIER_RATES.ECONOMY;
  const durationMin = durationSec / 60;
  
  const baseFare = rates.base;
  const distanceFare = distanceKm * rates.per_km;
  const timeFare = durationMin * rates.per_min;
  
  const subtotal = baseFare + distanceFare + timeFare;
  const total = subtotal * surgeMultiplier;
  
  return {
    base_fare: parseFloat(baseFare.toFixed(2)),
    total_fare: parseFloat(total.toFixed(2)),
    breakdown: {
      base: baseFare,
      distance: distanceFare,
      time: timeFare,
      surge: surgeMultiplier
    }
  };
}

/**
 * Start a trip
 */
exports.startTrip = async (tripId) => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Get trip and lock it
    const tripRes = await client.query(
      `SELECT t.*, r.tier, r.surge_multiplier, r.rider_id
       FROM trips t
       JOIN rides r ON t.ride_id = r.id
       WHERE t.id = $1
       FOR UPDATE`,
      [tripId]
    );
    
    if (tripRes.rowCount === 0) {
      throw new Error('Trip not found');
    }
    
    const trip = tripRes.rows[0];
    
    // Validate state transition
    if (!canStartTrip(trip.status)) {
      throw new StateTransitionError(
        `Cannot start trip in ${trip.status} state`,
        trip.status,
        TRIP_STATES.STARTED,
        'Trip'
      );
    }
    
    validateTripTransition(trip.status, TRIP_STATES.STARTED);
    
    // Update trip status
    const result = await client.query(
      `UPDATE trips
       SET status = 'STARTED',
           started_at = now(),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [tripId]
    );
    
    await client.query('COMMIT');
    
    // Broadcast trip started event
    wsManager.broadcastTripStarted(result.rows[0]);
    
    // Send notification to rider
    await notificationService.notifyTripStarted(trip.rider_id, {
      trip_id: tripId,
      started_at: result.rows[0].started_at
    });
    
    newrelic.recordMetric('Custom/Trip/Started', 1);
    
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    newrelic.noticeError(err, { context: 'startTrip', tripId });
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Pause a trip
 */
exports.pauseTrip = async (tripId) => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Get current trip state and lock it
    const tripRes = await client.query(
      `SELECT * FROM trips WHERE id = $1 FOR UPDATE`,
      [tripId]
    );
    
    if (tripRes.rowCount === 0) {
      throw new Error('Trip not found');
    }
    
    const trip = tripRes.rows[0];
    
    // Validate state transition
    if (!canPauseTrip(trip.status)) {
      throw new StateTransitionError(
        `Cannot pause trip in ${trip.status} state`,
        trip.status,
        TRIP_STATES.PAUSED,
        'Trip'
      );
    }
    
    validateTripTransition(trip.status, TRIP_STATES.PAUSED);
    
    // Update trip status
    const result = await client.query(
      `UPDATE trips
       SET status = $1,
           updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [TRIP_STATES.PAUSED, tripId]
    );
    
    await client.query('COMMIT');
    
    newrelic.recordMetric('Custom/Trip/Paused', 1);
    
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    newrelic.noticeError(err, { context: 'pauseTrip', tripId });
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Cancel a trip
 */
exports.cancelTrip = async (tripId, reason = 'User cancelled') => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Get trip with ride and driver details
    const tripRes = await client.query(
      `SELECT t.*, r.rider_id, r.id as ride_id
       FROM trips t
       JOIN rides r ON t.ride_id = r.id
       WHERE t.id = $1
       FOR UPDATE`,
      [tripId]
    );
    
    if (tripRes.rowCount === 0) {
      throw new Error('Trip not found');
    }
    
    const trip = tripRes.rows[0];
    
    // Validate state transition
    if (!canCancelTrip(trip.status)) {
      throw new StateTransitionError(
        `Cannot cancel trip in ${trip.status} state`,
        trip.status,
        TRIP_STATES.CANCELLED,
        'Trip'
      );
    }
    
    validateTripTransition(trip.status, TRIP_STATES.CANCELLED);
    
    // Update trip status
    const result = await client.query(
      `UPDATE trips
       SET status = $1,
           updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [TRIP_STATES.CANCELLED, tripId]
    );
    
    // Set driver back to AVAILABLE
    await client.query(
      `UPDATE drivers SET status='AVAILABLE', updated_at=now() WHERE id=$1`,
      [trip.driver_id]
    );
    
    // Update ride status to CANCELLED
    await client.query(
      `UPDATE rides SET status='CANCELLED', updated_at=now() WHERE id=$1`,
      [trip.ride_id]
    );
    
    // Invalidate driver cache
    await invalidateDriverCache(trip.driver_id);
    
    await client.query('COMMIT');
    
    // Send notifications
    await notificationService.notifyTripCancelled(trip.rider_id, {
      trip_id: tripId,
      reason: reason
    });
    
    newrelic.recordMetric('Custom/Trip/Cancelled', 1);
    
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    newrelic.noticeError(err, { context: 'cancelTrip', tripId });
    throw err;
  } finally {
    client.release();
  }
};

/**
 * End a trip with fare calculation
 */
exports.endTrip = async (tripId, tripData) => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Get trip with ride details
    const tripRes = await client.query(
      `SELECT t.*, r.tier, r.surge_multiplier, r.rider_id
       FROM trips t
       JOIN rides r ON t.ride_id = r.id
       WHERE t.id = $1
       FOR UPDATE`,
      [tripId]
    );
    
    if (tripRes.rowCount === 0) {
      throw new Error('Trip not found');
    }
    
    const trip = tripRes.rows[0];
    
    // Validate state transition
    if (!canEndTrip(trip.status)) {
      throw new StateTransitionError(
        `Cannot end trip in ${trip.status} state`,
        trip.status,
        TRIP_STATES.ENDED,
        'Trip'
      );
    }
    
    validateTripTransition(trip.status, TRIP_STATES.ENDED);
    
    // Use provided data or defaults
    const distanceKm = tripData?.distance_km || 10.5; // Mock if not provided
    const durationSec = tripData?.duration_sec || 
      Math.floor((new Date() - new Date(trip.started_at)) / 1000);
    
    // Calculate fare
    const fareCalc = calculateFare(
      distanceKm, 
      durationSec, 
      trip.tier,
      trip.surge_multiplier
    );
    
    // Update trip with fare
    const result = await client.query(
      `UPDATE trips
       SET status = $1,
           ended_at = now(),
           distance_km = $2,
           duration_sec = $3,
           base_fare = $4,
           total_fare = $5,
           updated_at = now()
       WHERE id = $6
       RETURNING *`,
      [TRIP_STATES.ENDED, distanceKm, durationSec, fareCalc.base_fare, fareCalc.total_fare, tripId]
    );
    
    // Set driver back to AVAILABLE
    const driverUpdate = await client.query(
      `UPDATE drivers SET status='AVAILABLE' WHERE id=$1 RETURNING *`,
      [trip.driver_id]
    );
    
    // Update ride status to COMPLETED
    const rideUpdate = await client.query(
      `UPDATE rides SET status='COMPLETED', updated_at=now() WHERE id=$1 RETURNING *`,
      [trip.ride_id]
    );
    
    // Invalidate driver cache when status changes back to AVAILABLE
    await invalidateDriverCache(trip.driver_id);
    
    await client.query('COMMIT');
    
    const tripResult = {
      ...result.rows[0],
      fare_breakdown: fareCalc.breakdown
    };
    
    // Broadcast trip ended event
    wsManager.broadcastTripEnded(tripResult);
    
    // Broadcast driver status changed back to AVAILABLE
    if (driverUpdate.rowCount > 0) {
      wsManager.broadcastDriverStatusChanged(driverUpdate.rows[0]);
    }
    
    // Broadcast ride status updated to COMPLETED
    if (rideUpdate.rowCount > 0) {
      wsManager.broadcastRideUpdated(rideUpdate.rows[0]);
    }
    
    // Send notification to rider
    await notificationService.notifyTripEnded(trip.rider_id, {
      trip_id: tripId,
      total_fare: fareCalc.total_fare,
      distance_km: distanceKm,
      duration_sec: durationSec
    });
    
    newrelic.recordMetric('Custom/Trip/Ended', 1);
    newrelic.recordMetric('Custom/Trip/Fare', fareCalc.total_fare);
    
    return tripResult;
  } catch (err) {
    await client.query('ROLLBACK');
    newrelic.noticeError(err, { context: 'endTrip', tripId });
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Get trip receipt
 */
exports.getTripReceipt = async (tripId) => {
  const result = await db.query(
    `SELECT 
       t.id as trip_id,
       t.started_at,
       t.ended_at,
       t.distance_km,
       t.duration_sec,
       t.base_fare,
       t.total_fare,
       t.status,
       r.id as ride_id,
       r.tier,
       r.payment_method,
       r.surge_multiplier,
       r.pickup_latitude,
       r.pickup_longitude,
       r.drop_latitude,
       r.drop_longitude,
       d.name as driver_name,
       d.phone as driver_phone,
       d.rating as driver_rating,
       p.status as payment_status,
       p.psp_transaction_id
     FROM trips t
     JOIN rides r ON t.ride_id = r.id
     JOIN drivers d ON t.driver_id = d.id
     LEFT JOIN payments p ON p.trip_id = t.id
     WHERE t.id = $1 AND t.status = 'ENDED'`,
    [tripId]
  );
  
  if (result.rowCount === 0) {
    throw new Error('Trip not found or not completed');
  }
  
  const trip = result.rows[0];
  
  // Calculate fare breakdown
  const rates = TIER_RATES[trip.tier] || TIER_RATES.ECONOMY;
  const durationMin = trip.duration_sec / 60;
  
  const receiptData = {
    receipt_id: trip.trip_id,
    trip_id: trip.trip_id,
    ride_id: trip.ride_id,
    timestamp: trip.ended_at,
    driver: {
      name: trip.driver_name,
      phone: trip.driver_phone,
      rating: trip.driver_rating
    },
    route: {
      pickup: {
        latitude: trip.pickup_latitude,
        longitude: trip.pickup_longitude
      },
      dropoff: {
        latitude: trip.drop_latitude,
        longitude: trip.drop_longitude
      }
    },
    trip_details: {
      started_at: trip.started_at,
      ended_at: trip.ended_at,
      distance_km: trip.distance_km,
      duration_minutes: Math.round(durationMin),
      tier: trip.tier
    },
    fare_breakdown: {
      base_fare: rates.base,
      distance_charge: (trip.distance_km * rates.per_km).toFixed(2),
      time_charge: (durationMin * rates.per_min).toFixed(2),
      subtotal: trip.base_fare,
      surge_multiplier: trip.surge_multiplier,
      total: trip.total_fare
    },
    payment: {
      method: trip.payment_method,
      status: trip.payment_status,
      transaction_id: trip.psp_transaction_id
    }
  };
  
  // Broadcast receipt to connected clients
  wsManager.broadcastTripReceipt(receiptData);
  
  return receiptData;
};

/**
 * Get trip by ride ID
 */
exports.getTripByRideId = async (rideId) => {
  const result = await db.query(
    `SELECT t.*, 
            r.rider_id, r.pickup_latitude, r.pickup_longitude,
            r.drop_latitude, r.drop_longitude, r.tier, r.payment_method,
            d.name as driver_name, d.phone as driver_phone, d.rating as driver_rating
     FROM trips t
     JOIN rides r ON t.ride_id = r.id
     JOIN drivers d ON t.driver_id = d.id
     WHERE t.ride_id = $1`,
    [rideId]
  );
  
  if (result.rowCount === 0) {
    throw new Error('Trip not found for this ride');
  }
  
  return result.rows[0];
};

/**
 * Get trip by driver ID and ride ID
 */
exports.getTripByDriverAndRide = async (driverId, rideId) => {
  const result = await db.query(
    `SELECT t.*, 
            r.rider_id, r.pickup_latitude, r.pickup_longitude,
            r.drop_latitude, r.drop_longitude, r.tier, r.payment_method,
            d.name as driver_name, d.phone as driver_phone, d.rating as driver_rating
     FROM trips t
     JOIN rides r ON t.ride_id = r.id
     JOIN drivers d ON t.driver_id = d.id
     WHERE t.driver_id = $1 AND t.ride_id = $2`,
    [driverId, rideId]
  );
  
  if (result.rowCount === 0) {
    throw new Error('Trip not found for this driver and ride');
  }
  
  return result.rows[0];
};