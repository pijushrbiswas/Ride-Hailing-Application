const db = require('../db');
const paymentService = require('../services/payment.service');
const newrelic = require('newrelic');

/**
 * Process outbox events for payment processing
 */
async function processOutbox() {
  try {
    const eventsRes = await db.query(
      `SELECT *
       FROM outbox_events
       WHERE processed = false
       ORDER BY created_at
       LIMIT 10`
    );

    if (eventsRes.rowCount === 0) {
      return; // No events to process
    }

    newrelic.recordMetric('Custom/Outbox/EventsFound', eventsRes.rowCount);

    for (const event of eventsRes.rows) {
      try {
        const payment = event.payload;

        // Process payment through PSP
        const result = await paymentService.processPayment(payment.id);

        if (result.success && result.processing) {
          // Payment sent to PSP successfully - keep event unprocessed
          // Webhook will confirm actual completion later
          newrelic.recordMetric('Custom/Outbox/SentToPSP', 1);
          console.log(`📤 Payment sent to PSP: ${payment.id}`);
        } else if (result.alreadyProcessed) {
          // Already processed or processing - mark outbox event as done
          await db.query(
            `UPDATE outbox_events
             SET processed = true
             WHERE id = $1`,
            [event.id]
          );
          newrelic.recordMetric('Custom/Outbox/AlreadyProcessed', 1);
        } else if (result.retry) {
          // Keep event unprocessed - will be picked up again in next poll
          newrelic.recordMetric('Custom/Outbox/PaymentRetrying', 1);
          console.log(`⏳ Payment retry ${result.retryCount}/${payment.max_retries || 3}: ${payment.id}`);
        } else {
          // Max retries exceeded - mark as processed to stop retrying
          await db.query(
            `UPDATE outbox_events
             SET processed = true
             WHERE id = $1`,
            [event.id]
          );

          newrelic.recordMetric('Custom/Outbox/ProcessedFailure', 1);
          console.log(`❌ Payment failed after max retries: ${payment.id}`);
        }
      } catch (err) {
        newrelic.recordMetric('Custom/Outbox/ProcessingError', 1);
        newrelic.noticeError(err, { eventId: event.id });
        console.error('❌ Outbox processing failed', err);
        // Leave event unprocessed → retry later
      }
    }
  } catch (err) {
    newrelic.noticeError(err, { context: 'processOutbox' });
    console.error('❌ Outbox query failed', err);
  }
}

/**
 * Worker health check - records heartbeat metric
 */
function recordHeartbeat() {
  newrelic.recordMetric('Custom/Worker/Heartbeat', 1);
}

let processInterval = null;
let heartbeatInterval = null;
let isRunning = false;

/**
 * Start the outbox worker
 */
function start() {
  if (isRunning) {
    console.log('Outbox worker already running');
    return;
  }
  
  isRunning = true;
  
  // Poll outbox every 5 seconds (handles both new payments and retries)
  processInterval = setInterval(processOutbox, 5000);
  
  // Heartbeat every 60 seconds
  heartbeatInterval = setInterval(recordHeartbeat, 60000);
  
  console.log('💳 Outbox worker started');
  console.log('📊 Polling unprocessed events every 5s');
  newrelic.recordMetric('Custom/Worker/Started', 1);
}

/**
 * Stop the outbox worker
 */
function stop() {
  if (!isRunning) {
    return;
  }
  
  isRunning = false;
  
  if (processInterval) {
    clearInterval(processInterval);
    processInterval = null;
  }
  
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  
  console.log('💳 Outbox worker stopped');
}

module.exports = {
  start,
  stop,
  processOutbox
};