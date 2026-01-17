const newrelic = require('newrelic');
const logger = require('../config/logger');

/**
 * Notification Service
 * Handles sending notifications for key ride/trip events
 * In production, integrate with FCM, SNS, or other push notification services
 */

/**
 * Notification types
 */
const NOTIFICATION_TYPES = {
  RIDE_ASSIGNED: 'RIDE_ASSIGNED',
  TRIP_STARTED: 'TRIP_STARTED',
  TRIP_ENDED: 'TRIP_ENDED',
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  DRIVER_ARRIVED: 'DRIVER_ARRIVED',
  TRIP_PAUSED: 'TRIP_PAUSED'
};

/**
 * Send notification to a user
 * @param {string} userId - User ID to send notification to
 * @param {string} type - Notification type
 * @param {object} data - Notification payload data
 */
async function sendNotification(userId, type, data) {
  try {
    // In production, this would call FCM/SNS/etc
    // For now, we'll log and record metrics
    
    const notification = {
      user_id: userId,
      type,
      data,
      timestamp: new Date().toISOString()
    };
    
    logger.info({ notification }, `Notification sent: ${type}`);
    
    // Record metric
    newrelic.recordMetric(`Custom/Notification/${type}`, 1);
    newrelic.addCustomAttribute('notification_type', type);
    
    // Mock: In production, send via push notification service
    // await fcm.send({ token: userToken, notification: { title, body }, data });
    
    return {
      success: true,
      notification_id: `notif_${Date.now()}`,
      type
    };
  } catch (error) {
    logger.error({ error, userId, type }, 'Failed to send notification');
    newrelic.recordMetric('Custom/Notification/Failed', 1);
    newrelic.noticeError(error, { userId, type });
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Notify rider that driver has been assigned
 */
exports.notifyRideAssigned = async (riderId, rideData) => {
  return sendNotification(riderId, NOTIFICATION_TYPES.RIDE_ASSIGNED, {
    title: 'Driver Assigned! 🚗',
    body: `${rideData.driver_name} will pick you up soon`,
    ride_id: rideData.ride_id,
    driver_name: rideData.driver_name,
    driver_phone: rideData.driver_phone,
    driver_rating: rideData.driver_rating,
    eta_minutes: rideData.eta_minutes || 5
  });
};

/**
 * Notify rider that trip has started
 */
exports.notifyTripStarted = async (riderId, tripData) => {
  return sendNotification(riderId, NOTIFICATION_TYPES.TRIP_STARTED, {
    title: 'Trip Started 🚀',
    body: 'Your ride has begun. Enjoy your journey!',
    trip_id: tripData.trip_id,
    started_at: tripData.started_at
  });
};

/**
 * Notify rider that trip has paused
 */
exports.notifyTripPaused = async (riderId, tripData) => {
  return sendNotification(riderId, NOTIFICATION_TYPES.TRIP_PAUSED, {
    title: 'Trip Paused ⏸️',
    body: 'Your trip has been paused',
    trip_id: tripData.trip_id
  });
};

/**
 * Notify rider that trip has ended
 */
exports.notifyTripEnded = async (riderId, tripData) => {
  return sendNotification(riderId, NOTIFICATION_TYPES.TRIP_ENDED, {
    title: 'Trip Completed ✅',
    body: `Total fare: $${tripData.total_fare}. Thanks for riding with us!`,
    trip_id: tripData.trip_id,
    total_fare: tripData.total_fare,
    distance_km: tripData.distance_km,
    duration_minutes: Math.round(tripData.duration_sec / 60)
  });
};

/**
 * Notify rider that payment completed
 */
exports.notifyPaymentCompleted = async (riderId, paymentData) => {
  return sendNotification(riderId, NOTIFICATION_TYPES.PAYMENT_COMPLETED, {
    title: 'Payment Successful 💳',
    body: `Payment of $${paymentData.amount} processed successfully`,
    payment_id: paymentData.payment_id,
    amount: paymentData.amount,
    transaction_id: paymentData.transaction_id
  });
};

/**
 * Notify rider that payment failed
 */
exports.notifyPaymentFailed = async (riderId, paymentData) => {
  return sendNotification(riderId, NOTIFICATION_TYPES.PAYMENT_FAILED, {
    title: 'Payment Failed ❌',
    body: 'There was an issue processing your payment. Please update your payment method.',
    payment_id: paymentData.payment_id,
    amount: paymentData.amount,
    reason: paymentData.failure_reason
  });
};

/**
 * Notify rider that driver has arrived
 */
exports.notifyDriverArrived = async (riderId, driverData) => {
  return sendNotification(riderId, NOTIFICATION_TYPES.DRIVER_ARRIVED, {
    title: 'Driver Arrived! 📍',
    body: `${driverData.driver_name} has arrived at pickup location`,
    driver_name: driverData.driver_name,
    driver_phone: driverData.driver_phone
  });
};

// Export notification types for use in other modules
exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
