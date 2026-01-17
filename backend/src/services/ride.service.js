const db = require('../db');
const wsManager = require('../utils/websocket');
const matchingService = require('./matching.service');

exports.createRide = async (data) => {
  const {
    rider_id,
    pickup_latitude,
    pickup_longitude,
    drop_latitude,
    drop_longitude,
    tier = 'ECONOMY',
    payment_method = 'CARD'
  } = data;

  const rideResult = await db.query(
    `INSERT INTO rides
     (rider_id, pickup_latitude, pickup_longitude, drop_latitude, drop_longitude, 
      tier, payment_method, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'MATCHING')
     RETURNING *`,
    [
      rider_id,
      pickup_latitude,
      pickup_longitude,
      drop_latitude,
      drop_longitude,
      tier,
      payment_method
    ]
  );

  const ride = rideResult.rows[0];

  // Broadcast ride created event
  wsManager.broadcastRideCreated(ride);

  // Find nearby drivers
  const candidate_drivers = await matchingService.findNearbyDrivers(
    pickup_latitude,
    pickup_longitude,
    tier
  );

  // Matching worker will automatically assign a driver
  return { ride, candidate_drivers };
};

exports.getRide = async (rideId) => {
  const result = await db.query(
    'SELECT * FROM rides WHERE id = $1',
    [rideId]
  );

  if (result.rowCount === 0) {
    throw new Error('Ride not found');
  }

  return result.rows[0];
};