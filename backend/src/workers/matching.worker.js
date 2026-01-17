/**
 * Matching Worker - Automatically assigns drivers to rides in MATCHING state
 * Runs continuously to pick up rides and find available drivers
 */

const db = require('../db');
const matchingService = require('../services/matching.service');
const assignmentService = require('../services/assignment.service');
const logger = require('../config/logger');
const newrelic = require('newrelic');

const POLL_INTERVAL_MS = 2000; // Check every 2 seconds
const MATCH_TIMEOUT_MS = 60000; // 60 seconds to find a driver
const MAX_ASSIGNMENT_ATTEMPTS = 3;

let isRunning = false;
let pollTimer = null;

/**
 * Get rides that need driver assignment
 */
async function getPendingRides() {
  const result = await db.query(
    `SELECT * FROM rides 
     WHERE status = 'MATCHING' 
       AND created_at > NOW() - INTERVAL '5 minutes'
     ORDER BY created_at ASC
     LIMIT 10`
  );
  
  return result.rows;
}

/**
 * Attempt to assign a driver to a ride
 */
async function attemptDriverAssignment(ride) {
  try {
    logger.info({ rideId: ride.id }, 'Attempting to assign driver to ride');
    
    // Find nearby available drivers
    const nearbyDrivers = await matchingService.findNearbyDrivers(
      ride.pickup_latitude,
      ride.pickup_longitude
    );
    
    if (!nearbyDrivers || nearbyDrivers.length === 0) {
      logger.warn({ rideId: ride.id }, 'No nearby drivers found');
      
      // Check if ride has exceeded timeout
      const rideAge = Date.now() - new Date(ride.created_at).getTime();
      if (rideAge > MATCH_TIMEOUT_MS) {
        await expireRide(ride.id);
        logger.warn({ rideId: ride.id }, 'Ride expired - no drivers available');
      }
      
      return null;
    }
    
    logger.info({ 
      rideId: ride.id, 
      driverCount: nearbyDrivers.length 
    }, 'Found nearby drivers');
    
    // Try to assign each driver in order (closest first)
    for (const driverData of nearbyDrivers) {
      try {
        // Extract driver ID from redis geo result
        const driverId = driverData.member || driverData;
        
        logger.info({ 
          rideId: ride.id, 
          driverId 
        }, 'Attempting assignment to driver');
        
        // Attempt assignment
        const result = await assignmentService.assignDriver(ride.id, driverId);
        
        if (result.success) {
          logger.info({ 
            rideId: ride.id, 
            driverId,
            tripId: result.trip.id
          }, 'Successfully assigned driver to ride');
          
          newrelic.recordMetric('Custom/Matching/Success', 1);
          return result;
        }
      } catch (err) {
        // Driver might have been assigned to another ride, continue to next
        logger.warn({ 
          rideId: ride.id, 
          driverId: driverData.member || driverData,
          error: err.message 
        }, 'Failed to assign driver, trying next');
        continue;
      }
    }
    
    logger.warn({ rideId: ride.id }, 'Failed to assign any nearby driver');
    return null;
    
  } catch (err) {
    logger.error({ 
      rideId: ride.id, 
      error: err.message,
      stack: err.stack 
    }, 'Error during driver assignment attempt');
    
    newrelic.noticeError(err, { context: 'attemptDriverAssignment', rideId: ride.id });
    throw err;
  }
}

/**
 * Expire a ride that couldn't find a driver
 */
async function expireRide(rideId) {
  try {
    const result = await db.query(
      `UPDATE rides 
       SET status = 'EXPIRED', updated_at = NOW()
       WHERE id = $1 AND status = 'MATCHING'
       RETURNING *`,
      [rideId]
    );
    
    if (result.rowCount > 0) {
      logger.info({ rideId }, 'Ride expired due to timeout');
      newrelic.recordMetric('Custom/Matching/Expired', 1);
    }
    
    return result.rows[0];
  } catch (err) {
    logger.error({ rideId, error: err.message }, 'Failed to expire ride');
    throw err;
  }
}

/**
 * Process all pending rides
 */
async function processMatchingRides() {
  try {
    const pendingRides = await getPendingRides();
    
    if (pendingRides.length === 0) {
      return;
    }
    
    logger.info({ count: pendingRides.length }, 'Processing pending rides');
    
    // Process rides concurrently (with some limit to avoid overwhelming)
    const batchSize = 5;
    for (let i = 0; i < pendingRides.length; i += batchSize) {
      const batch = pendingRides.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(ride => attemptDriverAssignment(ride))
      );
    }
    
  } catch (err) {
    logger.error({ error: err.message }, 'Error processing matching rides');
    newrelic.noticeError(err, { context: 'processMatchingRides' });
  }
}

/**
 * Main worker loop
 */
async function workerLoop() {
  if (!isRunning) {
    return;
  }
  
  try {
    await processMatchingRides();
  } catch (err) {
    logger.error({ error: err.message }, 'Error in matching worker loop');
  }
  
  // Schedule next iteration
  if (isRunning) {
    pollTimer = setTimeout(workerLoop, POLL_INTERVAL_MS);
  }
}

/**
 * Start the matching worker
 */
function start() {
  if (isRunning) {
    logger.warn('Matching worker already running');
    return;
  }
  
  isRunning = true;
  logger.info({ 
    pollInterval: POLL_INTERVAL_MS,
    matchTimeout: MATCH_TIMEOUT_MS 
  }, 'Starting matching worker');
  
  // Start the loop
  workerLoop();
}

/**
 * Stop the matching worker
 */
function stop() {
  if (!isRunning) {
    return;
  }
  
  isRunning = false;
  
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  
  logger.info('Stopped matching worker');
}

/**
 * Manually trigger matching for a specific ride
 */
async function matchRide(rideId) {
  const ride = await db.query(
    'SELECT * FROM rides WHERE id = $1',
    [rideId]
  );
  
  if (ride.rowCount === 0) {
    throw new Error('Ride not found');
  }
  
  return attemptDriverAssignment(ride.rows[0]);
}

module.exports = {
  start,
  stop,
  matchRide,
  processMatchingRides
};
