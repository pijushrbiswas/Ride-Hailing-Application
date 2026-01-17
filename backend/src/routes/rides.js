const router = require('express').Router();
const controller = require('../controllers/rides.controller');
const idempotency = require('../middlewares/idempotency.middleware');
const { validateCreateRide, validateUUID } = require('../middlewares/validation.middleware');

router.get('/', controller.getAllRides);
router.post('/', idempotency, validateCreateRide, controller.createRide);
router.get('/:id', validateUUID('id'), controller.getRide);
router.post('/:id/retry-matching', validateUUID('id'), controller.retryMatching);

module.exports = router;