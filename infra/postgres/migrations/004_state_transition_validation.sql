-- Migration: Add state transition validation constraints
-- Description: Adds database-level checks to enforce valid state transitions
-- Date: 2026-01-16

-- =========================================================
-- STATE TRANSITION TRACKING TABLES
-- =========================================================

-- Table to log all state transitions for audit trail
CREATE TABLE IF NOT EXISTS state_transition_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  entity_type TEXT NOT NULL, -- 'TRIP', 'RIDE', 'DRIVER'
  entity_id UUID NOT NULL,
  
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  
  transition_reason TEXT,
  transitioned_by TEXT,
  
  metadata JSONB,
  
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_state_audit_entity 
  ON state_transition_audit(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_state_audit_created_at 
  ON state_transition_audit(created_at DESC);

-- =========================================================
-- TRIGGER FUNCTIONS FOR STATE VALIDATION
-- =========================================================

-- Function to validate trip state transitions
CREATE OR REPLACE FUNCTION validate_trip_state_transition()
RETURNS TRIGGER AS $$
DECLARE
  valid_transitions TEXT[];
BEGIN
  -- Define allowed transitions based on current state
  CASE OLD.status
    WHEN 'CREATED' THEN
      valid_transitions := ARRAY['STARTED', 'CANCELLED'];
    WHEN 'STARTED' THEN
      valid_transitions := ARRAY['PAUSED', 'ENDED', 'CANCELLED'];
    WHEN 'PAUSED' THEN
      valid_transitions := ARRAY['STARTED', 'ENDED', 'CANCELLED'];
    WHEN 'ENDED' THEN
      valid_transitions := ARRAY[]::TEXT[]; -- Terminal state
    WHEN 'CANCELLED' THEN
      valid_transitions := ARRAY[]::TEXT[]; -- Terminal state
    ELSE
      RAISE EXCEPTION 'Unknown trip state: %', OLD.status;
  END CASE;

  -- Check if transition is allowed
  IF NOT (NEW.status = ANY(valid_transitions)) THEN
    RAISE EXCEPTION 'Invalid trip state transition from % to %. Allowed: %',
      OLD.status, NEW.status, valid_transitions;
  END IF;

  -- Log the transition
  INSERT INTO state_transition_audit (
    entity_type, entity_id, from_state, to_state, metadata
  ) VALUES (
    'TRIP', NEW.id, OLD.status, NEW.status, 
    jsonb_build_object(
      'ride_id', NEW.ride_id,
      'driver_id', NEW.driver_id
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate ride state transitions
CREATE OR REPLACE FUNCTION validate_ride_state_transition()
RETURNS TRIGGER AS $$
DECLARE
  valid_transitions TEXT[];
BEGIN
  -- Define allowed transitions based on current state
  CASE OLD.status
    WHEN 'REQUESTED' THEN
      valid_transitions := ARRAY['MATCHING', 'CANCELLED', 'EXPIRED'];
    WHEN 'MATCHING' THEN
      valid_transitions := ARRAY['DRIVER_ASSIGNED', 'CANCELLED', 'EXPIRED'];
    WHEN 'DRIVER_ASSIGNED' THEN
      valid_transitions := ARRAY['COMPLETED', 'CANCELLED'];
    WHEN 'COMPLETED' THEN
      valid_transitions := ARRAY[]::TEXT[]; -- Terminal state
    WHEN 'CANCELLED' THEN
      valid_transitions := ARRAY[]::TEXT[]; -- Terminal state
    WHEN 'EXPIRED' THEN
      valid_transitions := ARRAY[]::TEXT[]; -- Terminal state
    ELSE
      RAISE EXCEPTION 'Unknown ride state: %', OLD.status;
  END CASE;

  -- Check if transition is allowed
  IF NOT (NEW.status = ANY(valid_transitions)) THEN
    RAISE EXCEPTION 'Invalid ride state transition from % to %. Allowed: %',
      OLD.status, NEW.status, valid_transitions;
  END IF;

  -- Log the transition
  INSERT INTO state_transition_audit (
    entity_type, entity_id, from_state, to_state, metadata
  ) VALUES (
    'RIDE', NEW.id, OLD.status, NEW.status,
    jsonb_build_object(
      'rider_id', NEW.rider_id,
      'assigned_driver_id', NEW.assigned_driver_id,
      'tier', NEW.tier
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate driver state transitions
CREATE OR REPLACE FUNCTION validate_driver_state_transition()
RETURNS TRIGGER AS $$
DECLARE
  valid_transitions TEXT[];
BEGIN
  -- Define allowed transitions based on current state
  CASE OLD.status
    WHEN 'OFFLINE' THEN
      valid_transitions := ARRAY['AVAILABLE'];
    WHEN 'AVAILABLE' THEN
      valid_transitions := ARRAY['OFFLINE', 'ON_TRIP'];
    WHEN 'ON_TRIP' THEN
      valid_transitions := ARRAY['AVAILABLE', 'OFFLINE'];
    ELSE
      RAISE EXCEPTION 'Unknown driver state: %', OLD.status;
  END CASE;

  -- Check if transition is allowed
  IF NOT (NEW.status = ANY(valid_transitions)) THEN
    RAISE EXCEPTION 'Invalid driver state transition from % to %. Allowed: %',
      OLD.status, NEW.status, valid_transitions;
  END IF;

  -- Log the transition
  INSERT INTO state_transition_audit (
    entity_type, entity_id, from_state, to_state, metadata
  ) VALUES (
    'DRIVER', NEW.id, OLD.status, NEW.status,
    jsonb_build_object(
      'name', NEW.name,
      'location', ST_AsText(NEW.location)
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- CREATE TRIGGERS
-- =========================================================

-- Trip state transition trigger
DROP TRIGGER IF EXISTS trip_state_transition_check ON trips;
CREATE TRIGGER trip_state_transition_check
  BEFORE UPDATE OF status ON trips
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION validate_trip_state_transition();

-- Ride state transition trigger
DROP TRIGGER IF EXISTS ride_state_transition_check ON rides;
CREATE TRIGGER ride_state_transition_check
  BEFORE UPDATE OF status ON rides
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION validate_ride_state_transition();

-- Driver state transition trigger
DROP TRIGGER IF EXISTS driver_state_transition_check ON drivers;
CREATE TRIGGER driver_state_transition_check
  BEFORE UPDATE OF status ON drivers
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION validate_driver_state_transition();

-- =========================================================
-- ADDITIONAL INVARIANT CHECKS
-- =========================================================

-- Function to ensure trip timing consistency
CREATE OR REPLACE FUNCTION validate_trip_timing()
RETURNS TRIGGER AS $$
BEGIN
  -- started_at must be set when status is STARTED
  IF NEW.status IN ('STARTED', 'PAUSED', 'ENDED') AND NEW.started_at IS NULL THEN
    RAISE EXCEPTION 'Trip started_at must be set for status %', NEW.status;
  END IF;

  -- ended_at must be set when status is ENDED
  IF NEW.status = 'ENDED' AND NEW.ended_at IS NULL THEN
    RAISE EXCEPTION 'Trip ended_at must be set for ENDED status';
  END IF;

  -- ended_at must be after started_at
  IF NEW.ended_at IS NOT NULL AND NEW.started_at IS NOT NULL AND NEW.ended_at < NEW.started_at THEN
    RAISE EXCEPTION 'Trip ended_at must be after started_at';
  END IF;

  -- Fare must be set when trip is ended
  IF NEW.status = 'ENDED' AND (NEW.total_fare IS NULL OR NEW.base_fare IS NULL) THEN
    RAISE EXCEPTION 'Trip fare must be calculated for ENDED status';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trip timing validation trigger
DROP TRIGGER IF EXISTS trip_timing_check ON trips;
CREATE TRIGGER trip_timing_check
  BEFORE INSERT OR UPDATE ON trips
  FOR EACH ROW
  EXECUTE FUNCTION validate_trip_timing();

-- =========================================================
-- COMMENTS FOR DOCUMENTATION
-- =========================================================

COMMENT ON TABLE state_transition_audit IS 'Audit log for all entity state transitions';
COMMENT ON FUNCTION validate_trip_state_transition() IS 'Validates trip state transitions and logs them';
COMMENT ON FUNCTION validate_ride_state_transition() IS 'Validates ride state transitions and logs them';
COMMENT ON FUNCTION validate_driver_state_transition() IS 'Validates driver state transitions and logs them';
COMMENT ON FUNCTION validate_trip_timing() IS 'Ensures trip timing and fare consistency';
