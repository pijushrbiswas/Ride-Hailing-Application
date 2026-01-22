-- =========================================================
-- Migration: Initial Schema Setup
-- Date: 2026-01-15
-- Description: Creates all core tables for ride-hailing application
-- =========================================================

BEGIN;

-- =========================================================
-- Extensions
-- =========================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- =========================================================
-- ENUMS (Explicit state machines)
-- =========================================================
DO $$ BEGIN
  CREATE TYPE driver_status AS ENUM ('OFFLINE', 'AVAILABLE', 'ON_TRIP');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ride_status AS ENUM (
    'REQUESTED',
    'MATCHING',
    'DRIVER_ASSIGNED',
    'COMPLETED'
    'CANCELLED',
    'EXPIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trip_status AS ENUM (
    'CREATED',
    'STARTED',
    'PAUSED',
    'ENDED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================
-- DRIVERS
-- =========================================================
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,

  status driver_status NOT NULL DEFAULT 'OFFLINE',
  is_available BOOLEAN GENERATED ALWAYS AS (status = 'AVAILABLE') STORED,

  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location GEOGRAPHY(POINT, 4326),

  rating NUMERIC(2,1) DEFAULT 5.0,

  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drivers_status
  ON drivers(status);

CREATE INDEX IF NOT EXISTS idx_drivers_location
  ON drivers USING GIST(location);

-- =========================================================
-- RIDES (Request lifecycle)
-- =========================================================
CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  rider_id UUID NOT NULL,

  pickup_latitude DOUBLE PRECISION NOT NULL,
  pickup_longitude DOUBLE PRECISION NOT NULL,

  drop_latitude DOUBLE PRECISION NOT NULL,
  drop_longitude DOUBLE PRECISION NOT NULL,

  status ride_status NOT NULL DEFAULT 'REQUESTED',

  surge_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.0,

  assigned_driver_id UUID,
  assigned_at TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),

  CONSTRAINT fk_rides_driver
    FOREIGN KEY (assigned_driver_id)
    REFERENCES drivers(id)
);

CREATE INDEX IF NOT EXISTS idx_rides_status
  ON rides(status);

CREATE INDEX IF NOT EXISTS idx_rides_created_at
  ON rides(created_at);

-- =========================================================
-- TRIPS (Execution lifecycle)
-- =========================================================
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  ride_id UUID NOT NULL UNIQUE,
  driver_id UUID NOT NULL,

  status trip_status NOT NULL DEFAULT 'CREATED',

  started_at TIMESTAMP,
  ended_at TIMESTAMP,

  distance_km NUMERIC(6,2),
  duration_sec INTEGER,

  base_fare NUMERIC(8,2),
  total_fare NUMERIC(8,2),

  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),

  CONSTRAINT fk_trips_ride
    FOREIGN KEY (ride_id)
    REFERENCES rides(id),

  CONSTRAINT fk_trips_driver
    FOREIGN KEY (driver_id)
    REFERENCES drivers(id)
);

CREATE INDEX IF NOT EXISTS idx_trips_driver_id
  ON trips(driver_id, ride_id);

CREATE INDEX IF NOT EXISTS idx_trips_status
  ON trips(status);

-- =========================================================
-- PAYMENTS
-- =========================================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  trip_id UUID NOT NULL,
  amount NUMERIC(8,2) NOT NULL,

  status TEXT NOT NULL DEFAULT 'PENDING',

  created_at TIMESTAMP NOT NULL DEFAULT now(),

  CONSTRAINT fk_payments_trip
    FOREIGN KEY (trip_id)
    REFERENCES trips(id)
);

CREATE INDEX IF NOT EXISTS idx_payments_trip
  ON payments(trip_id);

-- =========================================================
-- OUTBOX (Exactly-once integration)
-- =========================================================
CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,

  payload JSONB NOT NULL,

  processed BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed
  ON outbox_events(processed)
  WHERE processed = FALSE;

-- =========================================================
-- SAFETY CONSTRAINTS (Critical invariants)
-- =========================================================

-- One active trip per driver
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_trip_per_driver
ON trips(driver_id)
WHERE status IN ('CREATED', 'STARTED', 'PAUSED');

-- One assigned driver per ride (already enforced via UNIQUE on assigned_driver_id)

COMMIT;
