const router = require('express').Router();
const controller = require('../controllers/drivers.controller');
const { validateLocationUpdate, validateAcceptRide, validateUUID } = require('../middlewares/validation.middleware');
const { locationLimiter } = require('../middlewares/security.middleware');

router.post('/', controller.createDriver);
router.get('/', controller.getAllDrivers);
router.get('/:id', validateUUID('id'), controller.getDriver);
router.post('/:id/location', locationLimiter, validateUUID('id'), validateLocationUpdate, controller.updateLocation);
router.patch('/:id/status', validateUUID('id'), controller.updateStatus);
router.post('/:id/accept', validateUUID('id'), validateAcceptRide, controller.acceptRide);

module.exports = router;