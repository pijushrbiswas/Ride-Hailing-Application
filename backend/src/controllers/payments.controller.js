const paymentService = require('../services/payment.service');
const newrelic = require('newrelic');

/**
 * Create a new payment for a trip
 * Supports idempotency via Idempotency-Key header
 */
exports.createPayment = async (req, res, next) => {
  try {
    const { trip_id } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];

    if (!trip_id) {
      return res.status(400).json({ error: 'trip_id is required' });
    }

    const payment = await paymentService.createPaymentForTrip(trip_id, idempotencyKey);
    
    newrelic.addCustomAttribute('payment_id', payment.id);
    newrelic.addCustomAttribute('trip_id', trip_id);
    
    res.status(201).json(payment);
  } catch (err) {
    next(err);
  }
};

/**
 * Get payment status
 */
exports.getPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await require('../db').query(
      'SELECT * FROM payments WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

/**
 * Webhook handler for PSP callbacks
 * Receives payment status updates from the payment service provider
 */
exports.handleWebhook = async (req, res, next) => {
  try {
    const webhookData = req.body;
    
    // Verify webhook signature (in production, verify PSP signature)
    const signature = req.headers['x-psp-signature'];
    
    if (!signature) {
      newrelic.recordMetric('Custom/Webhook/InvalidSignature', 1);
      return res.status(401).json({ error: 'Missing signature' });
    }

    // In production: verify signature with PSP secret
    // const isValid = verifyPSPSignature(webhookData, signature);
    // if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

    const payment = await paymentService.handleWebhook(webhookData);
    
    newrelic.addCustomAttribute('webhook_payment_id', payment.id);
    newrelic.addCustomAttribute('webhook_status', webhookData.status);
    
    res.json({ received: true, payment_id: payment.id });
  } catch (err) {
    newrelic.recordMetric('Custom/Webhook/Error', 1);
    next(err);
  }
};