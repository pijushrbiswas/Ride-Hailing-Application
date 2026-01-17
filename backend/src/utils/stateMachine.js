/**
 * State Machine for Trip and Ride Status Transitions
 * Ensures clean and valid state transitions with proper validation
 */

// =========================================================
// TRIP STATE MACHINE
// =========================================================

const TRIP_STATES = {
  CREATED: 'CREATED',
  STARTED: 'STARTED',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED'
};

// Allowed transitions for trip states
const TRIP_TRANSITIONS = {
  CREATED: ['STARTED', 'CANCELLED'],
  STARTED: ['PAUSED', 'ENDED', 'CANCELLED'],
  PAUSED: ['STARTED', 'ENDED', 'CANCELLED'],
  ENDED: [], // Terminal state
  CANCELLED: [] // Terminal state
};

// =========================================================
// RIDE STATE MACHINE
// =========================================================

const RIDE_STATES = {
  REQUESTED: 'REQUESTED',
  MATCHING: 'MATCHING',
  DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED'
};

// Allowed transitions for ride states
const RIDE_TRANSITIONS = {
  REQUESTED: ['MATCHING', 'CANCELLED', 'EXPIRED'],
  MATCHING: ['DRIVER_ASSIGNED', 'CANCELLED', 'EXPIRED'],
  DRIVER_ASSIGNED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [], // Terminal state
  CANCELLED: [], // Terminal state
  EXPIRED: [] // Terminal state
};

// =========================================================
// DRIVER STATE MACHINE
// =========================================================

const DRIVER_STATES = {
  OFFLINE: 'OFFLINE',
  AVAILABLE: 'AVAILABLE',
  ON_TRIP: 'ON_TRIP'
};

// Allowed transitions for driver states
const DRIVER_TRANSITIONS = {
  OFFLINE: ['AVAILABLE'],
  AVAILABLE: ['OFFLINE', 'ON_TRIP'],
  ON_TRIP: ['AVAILABLE', 'OFFLINE']
};

// =========================================================
// STATE VALIDATION
// =========================================================

class StateTransitionError extends Error {
  constructor(message, currentState, targetState, entity) {
    super(message);
    this.name = 'StateTransitionError';
    this.currentState = currentState;
    this.targetState = targetState;
    this.entity = entity;
  }
}

/**
 * Validate if a state transition is allowed
 * @param {string} currentState - Current state
 * @param {string} targetState - Target state
 * @param {object} transitions - Allowed transitions map
 * @param {string} entity - Entity type (for error messages)
 * @throws {StateTransitionError} If transition is invalid
 */
function validateTransition(currentState, targetState, transitions, entity) {
  if (!currentState) {
    throw new StateTransitionError(
      `${entity}: Current state is required`,
      currentState,
      targetState,
      entity
    );
  }

  if (!targetState) {
    throw new StateTransitionError(
      `${entity}: Target state is required`,
      currentState,
      targetState,
      entity
    );
  }

  const allowedTransitions = transitions[currentState];
  
  if (!allowedTransitions) {
    throw new StateTransitionError(
      `${entity}: Unknown current state '${currentState}'`,
      currentState,
      targetState,
      entity
    );
  }

  if (!allowedTransitions.includes(targetState)) {
    throw new StateTransitionError(
      `${entity}: Invalid transition from '${currentState}' to '${targetState}'. Allowed: [${allowedTransitions.join(', ')}]`,
      currentState,
      targetState,
      entity
    );
  }

  return true;
}

/**
 * Check if a state is terminal (no further transitions allowed)
 */
function isTerminalState(state, transitions) {
  return transitions[state] && transitions[state].length === 0;
}

// =========================================================
// TRIP STATE HELPERS
// =========================================================

/**
 * Validate trip state transition
 */
function validateTripTransition(currentState, targetState) {
  return validateTransition(currentState, targetState, TRIP_TRANSITIONS, 'Trip');
}

/**
 * Check if trip can be started
 */
function canStartTrip(currentState) {
  return currentState === TRIP_STATES.CREATED;
}

/**
 * Check if trip can be paused
 */
function canPauseTrip(currentState) {
  return currentState === TRIP_STATES.STARTED;
}

/**
 * Check if trip can be resumed
 */
function canResumeTrip(currentState) {
  return currentState === TRIP_STATES.PAUSED;
}

/**
 * Check if trip can be ended
 */
function canEndTrip(currentState) {
  return currentState === TRIP_STATES.STARTED || currentState === TRIP_STATES.PAUSED;
}

/**
 * Check if trip can be cancelled
 */
function canCancelTrip(currentState) {
  return [TRIP_STATES.CREATED, TRIP_STATES.STARTED, TRIP_STATES.PAUSED].includes(currentState);
}

/**
 * Check if trip is in terminal state
 */
function isTripTerminal(state) {
  return isTerminalState(state, TRIP_TRANSITIONS);
}

// =========================================================
// RIDE STATE HELPERS
// =========================================================

/**
 * Validate ride state transition
 */
function validateRideTransition(currentState, targetState) {
  return validateTransition(currentState, targetState, RIDE_TRANSITIONS, 'Ride');
}

/**
 * Check if ride can be assigned
 */
function canAssignRide(currentState) {
  return currentState === RIDE_STATES.MATCHING;
}

/**
 * Check if ride can be completed
 */
function canCompleteRide(currentState) {
  return currentState === RIDE_STATES.DRIVER_ASSIGNED;
}

/**
 * Check if ride can be cancelled
 */
function canCancelRide(currentState) {
  return [RIDE_STATES.REQUESTED, RIDE_STATES.MATCHING, RIDE_STATES.DRIVER_ASSIGNED].includes(currentState);
}

/**
 * Check if ride is in terminal state
 */
function isRideTerminal(state) {
  return isTerminalState(state, RIDE_TRANSITIONS);
}

// =========================================================
// DRIVER STATE HELPERS
// =========================================================

/**
 * Validate driver state transition
 */
function validateDriverTransition(currentState, targetState) {
  return validateTransition(currentState, targetState, DRIVER_TRANSITIONS, 'Driver');
}

/**
 * Check if driver can go online
 */
function canGoOnline(currentState) {
  return currentState === DRIVER_STATES.OFFLINE;
}

/**
 * Check if driver can go offline
 */
function canGoOffline(currentState) {
  return currentState === DRIVER_STATES.AVAILABLE;
}

/**
 * Check if driver can accept a trip
 */
function canAcceptTrip(currentState) {
  return currentState === DRIVER_STATES.AVAILABLE;
}

/**
 * Check if driver can complete a trip
 */
function canCompleteTrip(currentState) {
  return currentState === DRIVER_STATES.ON_TRIP;
}

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  // Constants
  TRIP_STATES,
  RIDE_STATES,
  DRIVER_STATES,
  TRIP_TRANSITIONS,
  RIDE_TRANSITIONS,
  DRIVER_TRANSITIONS,

  // Errors
  StateTransitionError,

  // Generic validation
  validateTransition,
  isTerminalState,

  // Trip state management
  validateTripTransition,
  canStartTrip,
  canPauseTrip,
  canResumeTrip,
  canEndTrip,
  canCancelTrip,
  isTripTerminal,

  // Ride state management
  validateRideTransition,
  canAssignRide,
  canCompleteRide,
  canCancelRide,
  isRideTerminal,

  // Driver state management
  validateDriverTransition,
  canGoOnline,
  canGoOffline,
  canAcceptTrip,
  canCompleteTrip
};
