const router = require('express').Router();
const controller = require('../controllers/trips.controller');
const { validateEndTrip, validateUUID } = require('../middlewares/validation.middleware');

router.post('/:id/start', validateUUID('id'), controller.startTrip);
router.post('/:id/pause', validateUUID('id'), controller.pauseTrip);
router.post('/:id/end', validateUUID('id'), validateEndTrip, controller.endTrip);
router.get('/:id/receipt', validateUUID('id'), controller.getReceipt);
router.get('/driver/:driverId/ride/:rideId', 
  validateUUID('driverId'), 
  validateUUID('rideId'), 
  controller.getTripByDriverAndRide
);

module.exports = router;