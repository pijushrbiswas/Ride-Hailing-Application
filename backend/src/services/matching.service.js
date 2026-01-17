const redis = require('../utils/redis');

const SEARCH_RADIUS_KM = 5;
const MAX_DRIVERS = 5;

exports.findNearbyDrivers = async (lat, lon) => {
  return redis.geoSearch(
    'drivers:geo',
    {
      longitude: lon,
      latitude: lat
    },
    {
      radius: SEARCH_RADIUS_KM,
      unit: 'km'
    },
    {
      SORT: 'ASC',
      COUNT: MAX_DRIVERS
    }
  );
};