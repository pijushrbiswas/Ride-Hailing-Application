const pool = require('../utils/db');

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect()
};