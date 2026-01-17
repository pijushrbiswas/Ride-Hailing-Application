const redis = require('../utils/redis');

module.exports = async (req, res, next) => {
  const key = req.headers['idempotency-key'];

  if (!key) return next();

  const cached = await redis.get(`idem:${key}`);
  if (cached) {
    return res.status(200).json(JSON.parse(cached));
  }

  const originalJson = res.json.bind(res);

  res.json = (body) => {
    redis.setEx(`idem:${key}`, 300, JSON.stringify(body));
    return originalJson(body);
  };

  next();
};