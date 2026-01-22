const db = require('../db');
const redis = require('../utils/redis');
const { invalidateDriverCache, removeDriverFromGeo, CACHE_TTL } = require('../utils/redis');
const logger = require('../config/logger');
const wsManager = require('../utils/websocket');

// Get driver from cache or database
exports.getDriverById = async (driverId) => {
  try {
    // Try to get from cache first
    const cachedDriver = await redis.get(`driver:${driverId}`);
    if (cachedDriver) {
      logger.info({ driverId }, 'Driver retrieved from cache');
      return JSON.parse(cachedDriver);
    }
  } catch (error) {
    logger.warn({ driverId, error: error.message }, 'Failed to get driver from cache');
  }

  // Fall back to database
  const result = await db.query(
    'SELECT * FROM drivers WHERE id=$1',
    [driverId]
  );

  if (result.rowCount === 0) {
    throw new Error('Driver not found');
  }

  const driver = result.rows[0];
  
  // Cache for next time
  await redis.setEx(`driver:${driverId}`, CACHE_TTL.DRIVER_STATUS, JSON.stringify(driver));
  await redis.setEx(`driver:status:${driverId}`, CACHE_TTL.DRIVER_STATUS, driver.status);
  
  return driver;
};

// Get driver status from cache or database
exports.getDriverStatus = async (driverId) => {
  try {
    // Try to get from cache first
    const cachedStatus = await redis.get(`driver:status:${driverId}`);
    if (cachedStatus) {
      logger.info({ driverId }, 'Driver status retrieved from cache');
      return cachedStatus;
    }
  } catch (error) {
    logger.warn({ driverId, error: error.message }, 'Failed to get driver status from cache');
  }

  // Fall back to database
  const result = await db.query(
    'SELECT status FROM drivers WHERE id=$1',
    [driverId]
  );

  if (result.rowCount === 0) {
    throw new Error('Driver not found');
  }

  const status = result.rows[0].status;
  
  // Cache for next time
  await redis.setEx(`driver:status:${driverId}`, CACHE_TTL.DRIVER_STATUS, status);
  
  return status;
};

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
  
  // Cache driver data and status
  await redis.setEx(`driver:${driver.id}`, CACHE_TTL.DRIVER_STATUS, JSON.stringify(driver));
  await redis.setEx(`driver:status:${driver.id}`, CACHE_TTL.DRIVER_STATUS, driver.status);
  
  // Broadcast to connected clients
  wsManager.broadcastDriverCreated(driver);
  
  logger.info({ driverId: driver.id }, 'Driver created');
  return driver;
};

exports.updateLocation = async (driverId, { latitude, longitude }) => {
  try {
    // 1. Update Redis GEO (fast path) with TTL
    await redis.geoAdd('drivers:geo', {
      longitude,
      latitude,
      member: driverId
    });
    
    // Set expiry on geo location (60 seconds)
    await redis.expire(`drivers:geo:${driverId}`, CACHE_TTL.DRIVER_LOCATION);

    // 2. Update Postgres ASYNCHRONOUSLY (fire-and-forget)
    // Don't await - return to client immediately after Redis is updated
    db.query(
      `UPDATE drivers
       SET latitude=$1,
           longitude=$2,
           location=ST_SetSRID(ST_MakePoint($2, $1), 4326),
       updated_at=now()
       WHERE id=$3`,
      [latitude, longitude, driverId]
    ).catch(error => {
      logger.error({ driverId, error: error.message }, 'Failed to update PostgreSQL location');
    });

    // 3. Broadcast location update to connected clients
    const driver = { id: driverId, latitude, longitude };
    wsManager.broadcastLocationUpdate(driver);

    logger.info({ driverId, latitude, longitude }, 'Driver location updated in Redis');
    return driver;
  } catch (error) {
    logger.error({ driverId, error: error.message }, 'Failed to update driver location');
    throw error;
  }
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

  // Update cache with new driver data and status
  await redis.setEx(`driver:${driverId}`, CACHE_TTL.DRIVER_STATUS, JSON.stringify(driver));
  await redis.setEx(`driver:status:${driverId}`, CACHE_TTL.DRIVER_STATUS, status);

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