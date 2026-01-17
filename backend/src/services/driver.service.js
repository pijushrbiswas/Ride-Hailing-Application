const db = require('../db');
const redis = require('../utils/redis');
const { invalidateDriverCache, removeDriverFromGeo, CACHE_TTL } = require('../utils/redis');
const logger = require('../config/logger');
const wsManager = require('../utils/websocket');

exports.createDriver = async (data) => {
  const { name, phone, latitude, longitude } = data;

  const result = await db.query(
    `INSERT INTO drivers (name, phone, latitude, longitude, status)
     VALUES ($1, $2, $3, $4, 'AVAILABLE')
     RETURNING *`,
    [name, phone, latitude, longitude]
  );

  const driver = result.rows[0];
  
  // Add to Redis geo index if location provided
  if (latitude && longitude) {
    await redis.geoAdd('drivers:geo', {
      longitude,
      latitude,
      member: driver.id
    });
    logger.info({ driverId: driver.id }, 'Driver added to geo index');
  }
  
  // Broadcast to connected clients
  wsManager.broadcastDriverCreated(driver);
  
  logger.info({ driverId: driver.id }, 'Driver created');
  return driver;
};

exports.updateLocation = async (driverId, { latitude, longitude }) => {
  // 1. Update Redis GEO (fast path) with TTL
  await redis.geoAdd('drivers:geo', {
    longitude,
    latitude,
    member: driverId
  });
  
  // Set expiry on geo location
  await redis.expire(`drivers:geo:${driverId}`, CACHE_TTL.DRIVER_LOCATION);

  // 2. Update Postgres (source of truth) - without PostGIS
  await db.query(
    `UPDATE drivers
     SET latitude=$1,
         longitude=$2,
         updated_at=now()
     WHERE id=$3`,
    [latitude, longitude, driverId]
  );
};

exports.updateDriverStatus = async (driverId, status) => {
  const result = await db.query(
    `UPDATE drivers
     SET status=$1,
         updated_at=now()
     WHERE id=$2
     RETURNING *`,
    [status, driverId]
  );

  if (result.rowCount === 0) {
    throw new Error('Driver not found');
  }

  const driver = result.rows[0];

  // Invalidate cache when driver status changes
  await invalidateDriverCache(driverId);

  // Handle geo index based on status
  if (status === 'OFFLINE') {
    await removeDriverFromGeo(driverId);
    logger.info({ driverId }, 'Driver went offline, removed from geo index');
  } else if (status === 'AVAILABLE' && driver.latitude && driver.longitude) {
    // Add to geo index when going online
    await redis.geoAdd('drivers:geo', {
      longitude: driver.longitude,
      latitude: driver.latitude,
      member: driverId
    });
    logger.info({ driverId }, 'Driver went online, added to geo index');
  }

  // Broadcast status change
  wsManager.broadcastDriverStatusChanged(driver);
  
  logger.info({ driverId, status }, 'Driver status updated');
  return driver;
};

exports.deleteDriver = async (driverId) => {
  // Remove from geo index first
  await removeDriverFromGeo(driverId);
  
  // Invalidate cache
  await invalidateDriverCache(driverId);
  
  // Delete from database
  const result = await db.query(
    'DELETE FROM drivers WHERE id=$1 RETURNING *',
    [driverId]
  );

  if (result.rowCount === 0) {
    throw new Error('Driver not found');
  }

  logger.info({ driverId }, 'Driver deleted');
  return result.rows[0];
};