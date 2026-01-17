const router = require('express').Router();
const controller = require('../controllers/payments.controller');
const idempotencyMiddleware = require('../middlewares/idempotency.middleware');
const { validateCreatePayment, validateUUID } = require('../middlewares/validation.middleware');
const { paymentLimiter } = require('../middlewares/security.middleware');

// Create payment with idempotency protection and rate limiting
router.post('/', paymentLimiter, idempotencyMiddleware, validateCreatePayment, controller.createPayment);

// Get payment status
router.get('/:id', validateUUID('id'), controller.getPayment);

// Webhook endpoint for PSP callbacks (no rate limit for webhooks)
router.post('/webhooks/psp', controller.handleWebhook);

module.exports = router;