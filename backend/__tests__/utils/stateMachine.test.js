/**
 * Tests for State Machine module
 */

const {
  TRIP_STATES,
  RIDE_STATES,
  DRIVER_STATES,
  validateTripTransition,
  validateRideTransition,
  validateDriverTransition,
  canStartTrip,
  canPauseTrip,
  canEndTrip,
  canCancelTrip,
  canAssignRide,
  canCompleteRide,
  canCancelRide,
  canAcceptTrip,
  canCompleteTrip,
  isTripTerminal,
  isRideTerminal,
  StateTransitionError
} = require('../../src/utils/stateMachine');

describe('State Machine - Trip Transitions', () => {
  describe('Valid Transitions', () => {
    test('CREATED -> STARTED is valid', () => {
      expect(() => validateTripTransition(TRIP_STATES.CREATED, TRIP_STATES.STARTED)).not.toThrow();
      expect(canStartTrip(TRIP_STATES.CREATED)).toBe(true);
    });

    test('CREATED -> CANCELLED is valid', () => {
      expect(() => validateTripTransition(TRIP_STATES.CREATED, TRIP_STATES.CANCELLED)).not.toThrow();
      expect(canCancelTrip(TRIP_STATES.CREATED)).toBe(true);
    });

    test('STARTED -> PAUSED is valid', () => {
      expect(() => validateTripTransition(TRIP_STATES.STARTED, TRIP_STATES.PAUSED)).not.toThrow();
      expect(canPauseTrip(TRIP_STATES.STARTED)).toBe(true);
    });

    test('STARTED -> ENDED is valid', () => {
      expect(() => validateTripTransition(TRIP_STATES.STARTED, TRIP_STATES.ENDED)).not.toThrow();
      expect(canEndTrip(TRIP_STATES.STARTED)).toBe(true);
    });

    test('PAUSED -> STARTED is valid (resume)', () => {
      expect(() => validateTripTransition(TRIP_STATES.PAUSED, TRIP_STATES.STARTED)).not.toThrow();
    });

    test('PAUSED -> ENDED is valid', () => {
      expect(() => validateTripTransition(TRIP_STATES.PAUSED, TRIP_STATES.ENDED)).not.toThrow();
      expect(canEndTrip(TRIP_STATES.PAUSED)).toBe(true);
    });
  });

  describe('Invalid Transitions', () => {
    test('CREATED -> ENDED is invalid', () => {
      expect(() => validateTripTransition(TRIP_STATES.CREATED, TRIP_STATES.ENDED))
        .toThrow(StateTransitionError);
    });

    test('CREATED -> PAUSED is invalid', () => {
      expect(() => validateTripTransition(TRIP_STATES.CREATED, TRIP_STATES.PAUSED))
        .toThrow(StateTransitionError);
    });

    test('ENDED -> any state is invalid (terminal)', () => {
      expect(() => validateTripTransition(TRIP_STATES.ENDED, TRIP_STATES.STARTED))
        .toThrow(StateTransitionError);
      expect(isTripTerminal(TRIP_STATES.ENDED)).toBe(true);
    });

    test('CANCELLED -> any state is invalid (terminal)', () => {
      expect(() => validateTripTransition(TRIP_STATES.CANCELLED, TRIP_STATES.STARTED))
        .toThrow(StateTransitionError);
      expect(isTripTerminal(TRIP_STATES.CANCELLED)).toBe(true);
    });
  });

  describe('State Check Helpers', () => {
    test('canStartTrip only true for CREATED', () => {
      expect(canStartTrip(TRIP_STATES.CREATED)).toBe(true);
      expect(canStartTrip(TRIP_STATES.STARTED)).toBe(false);
      expect(canStartTrip(TRIP_STATES.PAUSED)).toBe(false);
    });

    test('canPauseTrip only true for STARTED', () => {
      expect(canPauseTrip(TRIP_STATES.STARTED)).toBe(true);
      expect(canPauseTrip(TRIP_STATES.CREATED)).toBe(false);
      expect(canPauseTrip(TRIP_STATES.PAUSED)).toBe(false);
    });

    test('canEndTrip true for STARTED or PAUSED', () => {
      expect(canEndTrip(TRIP_STATES.STARTED)).toBe(true);
      expect(canEndTrip(TRIP_STATES.PAUSED)).toBe(true);
      expect(canEndTrip(TRIP_STATES.CREATED)).toBe(false);
      expect(canEndTrip(TRIP_STATES.ENDED)).toBe(false);
    });

    test('canCancelTrip true for non-terminal states', () => {
      expect(canCancelTrip(TRIP_STATES.CREATED)).toBe(true);
      expect(canCancelTrip(TRIP_STATES.STARTED)).toBe(true);
      expect(canCancelTrip(TRIP_STATES.PAUSED)).toBe(true);
      expect(canCancelTrip(TRIP_STATES.ENDED)).toBe(false);
      expect(canCancelTrip(TRIP_STATES.CANCELLED)).toBe(false);
    });
  });
});

describe('State Machine - Ride Transitions', () => {
  describe('Valid Transitions', () => {
    test('REQUESTED -> MATCHING is valid', () => {
      expect(() => validateRideTransition(RIDE_STATES.REQUESTED, RIDE_STATES.MATCHING)).not.toThrow();
    });

    test('MATCHING -> DRIVER_ASSIGNED is valid', () => {
      expect(() => validateRideTransition(RIDE_STATES.MATCHING, RIDE_STATES.DRIVER_ASSIGNED)).not.toThrow();
      expect(canAssignRide(RIDE_STATES.MATCHING)).toBe(true);
    });

    test('DRIVER_ASSIGNED -> COMPLETED is valid', () => {
      expect(() => validateRideTransition(RIDE_STATES.DRIVER_ASSIGNED, RIDE_STATES.COMPLETED)).not.toThrow();
      expect(canCompleteRide(RIDE_STATES.DRIVER_ASSIGNED)).toBe(true);
    });

    test('All non-terminal states can be CANCELLED', () => {
      expect(() => validateRideTransition(RIDE_STATES.REQUESTED, RIDE_STATES.CANCELLED)).not.toThrow();
      expect(() => validateRideTransition(RIDE_STATES.MATCHING, RIDE_STATES.CANCELLED)).not.toThrow();
      expect(() => validateRideTransition(RIDE_STATES.DRIVER_ASSIGNED, RIDE_STATES.CANCELLED)).not.toThrow();
    });
  });

  describe('Invalid Transitions', () => {
    test('REQUESTED -> DRIVER_ASSIGNED is invalid (must go through MATCHING)', () => {
      expect(() => validateRideTransition(RIDE_STATES.REQUESTED, RIDE_STATES.DRIVER_ASSIGNED))
        .toThrow(StateTransitionError);
    });

    test('REQUESTED -> COMPLETED is invalid', () => {
      expect(() => validateRideTransition(RIDE_STATES.REQUESTED, RIDE_STATES.COMPLETED))
        .toThrow(StateTransitionError);
    });

    test('COMPLETED -> any state is invalid (terminal)', () => {
      expect(() => validateRideTransition(RIDE_STATES.COMPLETED, RIDE_STATES.MATCHING))
        .toThrow(StateTransitionError);
      expect(isRideTerminal(RIDE_STATES.COMPLETED)).toBe(true);
    });
  });

  describe('State Check Helpers', () => {
    test('canAssignRide only true for MATCHING', () => {
      expect(canAssignRide(RIDE_STATES.MATCHING)).toBe(true);
      expect(canAssignRide(RIDE_STATES.REQUESTED)).toBe(false);
      expect(canAssignRide(RIDE_STATES.DRIVER_ASSIGNED)).toBe(false);
    });

    test('canCompleteRide only true for DRIVER_ASSIGNED', () => {
      expect(canCompleteRide(RIDE_STATES.DRIVER_ASSIGNED)).toBe(true);
      expect(canCompleteRide(RIDE_STATES.MATCHING)).toBe(false);
      expect(canCompleteRide(RIDE_STATES.COMPLETED)).toBe(false);
    });
  });
});

describe('State Machine - Driver Transitions', () => {
  describe('Valid Transitions', () => {
    test('OFFLINE -> AVAILABLE is valid', () => {
      expect(() => validateDriverTransition(DRIVER_STATES.OFFLINE, DRIVER_STATES.AVAILABLE)).not.toThrow();
    });

    test('AVAILABLE -> ON_TRIP is valid', () => {
      expect(() => validateDriverTransition(DRIVER_STATES.AVAILABLE, DRIVER_STATES.ON_TRIP)).not.toThrow();
      expect(canAcceptTrip(DRIVER_STATES.AVAILABLE)).toBe(true);
    });

    test('ON_TRIP -> AVAILABLE is valid', () => {
      expect(() => validateDriverTransition(DRIVER_STATES.ON_TRIP, DRIVER_STATES.AVAILABLE)).not.toThrow();
      expect(canCompleteTrip(DRIVER_STATES.ON_TRIP)).toBe(true);
    });

    test('AVAILABLE -> OFFLINE is valid', () => {
      expect(() => validateDriverTransition(DRIVER_STATES.AVAILABLE, DRIVER_STATES.OFFLINE)).not.toThrow();
    });
  });

  describe('Invalid Transitions', () => {
    test('OFFLINE -> ON_TRIP is invalid', () => {
      expect(() => validateDriverTransition(DRIVER_STATES.OFFLINE, DRIVER_STATES.ON_TRIP))
        .toThrow(StateTransitionError);
    });

    test('ON_TRIP -> OFFLINE is valid for emergency', () => {
      expect(() => validateDriverTransition(DRIVER_STATES.ON_TRIP, DRIVER_STATES.OFFLINE)).not.toThrow();
    });
  });
});

describe('StateTransitionError', () => {
  test('Error contains relevant state information', () => {
    try {
      validateTripTransition(TRIP_STATES.ENDED, TRIP_STATES.STARTED);
      fail('Should have thrown StateTransitionError');
    } catch (error) {
      expect(error).toBeInstanceOf(StateTransitionError);
      expect(error.currentState).toBe(TRIP_STATES.ENDED);
      expect(error.targetState).toBe(TRIP_STATES.STARTED);
      expect(error.entity).toBe('Trip');
      expect(error.message).toContain('Invalid transition');
    }
  });
});
