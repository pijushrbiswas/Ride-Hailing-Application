const db = require('../db');
const newrelic = require('newrelic');
const notificationService = require('./notification.service');

// Exponential backoff: 30s, 2m, 8m
const RETRY_DELAYS_MS = [30000, 120000, 480000];
const MAX_RETRIES = 3;

/**
 * Simulates PSP (Payment Service Provider) API call
 * In production, replace with actual Stripe/Braintree/etc API
 */
async function callPSP(payment) {
  const startTime = Date.now();
  
  try {
    // Simulate PSP API latency
    await new Promise((res) => setTimeout(res, 500));

    // Simulate 20% failure rate for testing retries
    if (Math.random() < 0.2) {
      throw new Error('PSP_NETWORK_ERROR');
    }

    const pspResponse = {
      transaction_id: `txn_${Date.now()}_${payment.id.substring(0, 8)}`,
      status: 'success',
      amount: payment.amount,
      timestamp: new Date().toISOString()
    };

    // Record successful payment metric
    newrelic.recordMetric('Custom/Payment/Success', 1);
    newrelic.recordMetric('Custom/Payment/Duration', Date.now() - startTime);

    return pspResponse;
  } catch (error) {
    // Record failure metric
    newrelic.recordMetric('Custom/Payment/Failure', 1);
    newrelic.noticeError(error, { paymentId: payment.id });
    throw error;
  }
}

/**
 * Process a payment with retry logic
 */
async function processPayment(paymentId) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Fetch payment with row lock
    const paymentRes = await client.query(
      `SELECT * FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId]
    );

    if (paymentRes.rowCount === 0) {
      throw new Error('Payment not found');
    }

    const payment = paymentRes.rows[0];

    // Check if already completed/processing or max retries exceeded
    if (payment.status === 'COMPLETED' || payment.status === 'PROCESSING') {
      await client.query('COMMIT');
      return { success: true, alreadyProcessed: true, payment };
    }

    if (payment.retry_count >= MAX_RETRIES) {
      await client.query(
        `UPDATE payments 
         SET status = 'FAILED', 
             failure_reason = 'Max retries exceeded',
             updated_at = now()
         WHERE id = $1`,
        [paymentId]
      );
      await client.query('COMMIT');
      
      newrelic.recordMetric('Custom/Payment/MaxRetriesExceeded', 1);
      return { success: false, reason: 'Max retries exceeded' };
    }

    // Call PSP
    try {
      const pspResponse = await callPSP(payment);

      // Mark payment as processing (PSP accepted request)
      // Webhook will update to COMPLETED/FAILED when PSP finishes
      await client.query(
        `UPDATE payments
         SET status = 'PROCESSING',
             psp_transaction_id = $1,
             psp_response = $2,
             updated_at = now()
         WHERE id = $3`,
        [pspResponse.transaction_id, JSON.stringify(pspResponse), paymentId]
      );

      await client.query('COMMIT');
      
      // Record metric for PSP request sent
      if (payment.retry_count > 0) {
        newrelic.recordMetric('Custom/Payment/RetrySent', 1);
      }
      newrelic.recordMetric('Custom/Payment/ProcessingSent', 1);

      return { success: true, processing: true, payment, pspResponse };
    } catch (pspError) {
      // Calculate next retry time with exponential backoff
      const retryCount = payment.retry_count + 1;
      const delayMs = RETRY_DELAYS_MS[retryCount - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      const nextRetryAt = new Date(Date.now() + delayMs);

      await client.query(
        `UPDATE payments
         SET retry_count = $1,
             last_retry_at = now(),
             next_retry_at = $2,
             failure_reason = $3,
             updated_at = now()
         WHERE id = $4`,
        [retryCount, nextRetryAt, pspError.message, paymentId]
      );

      await client.query('COMMIT');

      newrelic.recordMetric('Custom/Payment/Retry', 1);
      newrelic.recordMetric('Custom/Payment/RetryCount', retryCount);

      return { 
        success: false, 
        retry: true, 
        retryCount, 
        nextRetryAt,
        reason: pspError.message 
      };
    }
  } catch (err) {
    await client.query('ROLLBACK');
    newrelic.noticeError(err, { context: 'processPayment', paymentId });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Create a payment for a trip
 */
exports.createPaymentForTrip = async (tripId, idempotencyKey) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. Fetch trip (lock row)
    const tripRes = await client.query(
      `SELECT id, total_fare
       FROM trips
       WHERE id = $1
       FOR UPDATE`,
      [tripId]
    );

    if (tripRes.rowCount === 0) {
      throw new Error('Trip not found');
    }

    const amount = tripRes.rows[0].total_fare;

    // 2. Create payment
    const paymentRes = await client.query(
      `INSERT INTO payments (trip_id, amount, status)
       VALUES ($1, $2, 'PENDING')
       RETURNING *`,
      [tripId, amount]
    );

    const payment = paymentRes.rows[0];

    // 3. Write outbox event
    await client.query(
      `INSERT INTO outbox_events
       (aggregate_type, aggregate_id, event_type, payload)
       VALUES ('PAYMENT', $1, 'PAYMENT_CREATED', $2)`,
      [payment.id, payment]
    );

    await client.query('COMMIT');
    
    newrelic.recordMetric('Custom/Payment/Created', 1);
    
    return payment;
  } catch (err) {
    await client.query('ROLLBACK');
    newrelic.noticeError(err, { context: 'createPaymentForTrip', tripId });
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Handle webhook from PSP
 */
exports.handleWebhook = async (webhookData) => {
  const { transaction_id, status, payment_id } = webhookData;

  try {
    const result = await db.query(
      `UPDATE payments
       SET status = $1,
           psp_transaction_id = $2,
           psp_response = $3,
           updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [
        status === 'succeeded' ? 'COMPLETED' : 'FAILED',
        transaction_id,
        JSON.stringify(webhookData),
        payment_id
      ]
    );

    if (result.rowCount === 0) {
      throw new Error('Payment not found for webhook');
    }

    const payment = result.rows[0];

    // Get rider info from trip
    const tripResult = await db.query(
      `SELECT r.rider_id
       FROM trips t
       JOIN rides r ON t.ride_id = r.id
       WHERE t.id = $1`,
      [payment.trip_id]
    );

    if (tripResult.rowCount > 0) {
      const riderId = tripResult.rows[0].rider_id;
      
      if (status === 'succeeded') {
        await notificationService.notifyPaymentCompleted(riderId, {
          payment_id: payment.id,
          amount: payment.amount,
          transaction_id
        });
      } else {
        await notificationService.notifyPaymentFailed(riderId, {
          payment_id: payment.id,
          amount: payment.amount,
          failure_reason: webhookData.failure_reason || 'Payment declined'
        });
      }
    }

    newrelic.recordMetric('Custom/Payment/WebhookReceived', 1);
    newrelic.recordMetric(`Custom/Payment/Webhook/${status}`, 1);

    // Mark corresponding outbox event as processed
    await db.query(
      `UPDATE outbox_events
       SET processed = true
       WHERE aggregate_type = 'PAYMENT'
         AND aggregate_id = $1
         AND processed = false`,
      [payment.id]
    );

    return payment;
  } catch (err) {
    newrelic.noticeError(err, { context: 'handleWebhook', webhookData });
    throw err;
  }
};

exports.processPayment = processPayment;