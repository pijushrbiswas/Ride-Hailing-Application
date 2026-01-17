const { createClient } = require('redis');

const client = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
});

client.connect();

client.on('error', (err) => {
  console.error('Redis Error', err);
});

// Cache invalidation helpers
const CACHE_TTL = {
  DRIVER_LOCATION: 60,      // 60 seconds - driver locations expire quickly
  RIDE_DATA: 300,           // 5 minutes - ride data
  DRIVER_STATUS: 120        // 2 minutes - driver status
};

// Invalidate driver location cache when driver status changes
async function invalidateDriverCache(driverId) {
  try {
    await client.del(`driver:${driverId}`);
    await client.del(`driver:status:${driverId}`);
  } catch (err) {
    console.error('Cache invalidation error:', err);
  }
}

// Invalidate ride cache
async function invalidateRideCache(rideId) {
  try {
    await client.del(`ride:${rideId}`);
  } catch (err) {
    console.error('Cache invalidation error:', err);
  }
}

// Remove driver from geo index when offline
async function removeDriverFromGeo(driverId) {
  try {
    await client.zRem('drivers:geo', driverId);
  } catch (err) {
    console.error('Geo removal error:', err);
  }
}

module.exports = client;
module.exports.invalidateDriverCache = invalidateDriverCache;
module.exports.invalidateRideCache = invalidateRideCache;
module.exports.removeDriverFromGeo = removeDriverFromGeo;
module.exports.CACHE_TTL = CACHE_TTL;