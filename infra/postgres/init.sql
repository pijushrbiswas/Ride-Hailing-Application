-- =========================================================
-- Database Initialization Script (No PostGIS)
-- =========================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE driver_status AS ENUM ('OFFLINE', 'AVAILABLE', 'ON_TRIP');
CREATE TYPE ride_status AS ENUM ('REQUESTED', 'MATCHING', 'DRIVER_ASSIGNED', 'CANCELLED', 'EXPIRED', 'COMPLETED');
CREATE TYPE trip_status AS ENUM ('CREATED', 'STARTED', 'PAUSED', 'ENDED', 'CANCELLED');
CREATE TYPE ride_tier AS ENUM ('ECONOMY', 'PREMIUM', 'LUXURY');
CREATE TYPE payment_method AS ENUM ('CARD', 'CASH', 'WALLET', 'UPI');

-- Drivers Table
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  status driver_status NOT NULL DEFAULT 'OFFLINE',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  rating NUMERIC(2,1) DEFAULT 5.0,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Rides Table
CREATE TABLE rides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL,
  pickup_latitude DOUBLE PRECISION NOT NULL,
  pickup_longitude DOUBLE PRECISION NOT NULL,
  drop_latitude DOUBLE PRECISION NOT NULL,
  drop_longitude DOUBLE PRECISION NOT NULL,
  status ride_status NOT NULL DEFAULT 'REQUESTED',
  tier ride_tier NOT NULL DEFAULT 'ECONOMY',
  payment_method payment_method NOT NULL DEFAULT 'CARD',
  surge_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  assigned_driver_id UUID UNIQUE,
  assigned_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT fk_rides_driver FOREIGN KEY (assigned_driver_id) REFERENCES drivers(id)
);

-- Trips Table
CREATE TABLE trips (
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
  CONSTRAINT fk_trips_ride FOREIGN KEY (ride_id) REFERENCES rides(id),
  CONSTRAINT fk_trips_driver FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

-- Payments Table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL,
  amount NUMERIC(8,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  psp_transaction_id TEXT,
  psp_response JSONB,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  last_retry_at TIMESTAMP,
  next_retry_at TIMESTAMP,
  failure_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT fk_payments_trip FOREIGN KEY (trip_id) REFERENCES trips(id)
);

-- Outbox Events Table
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_drivers_status ON drivers(status);
CREATE INDEX idx_rides_status ON rides(status);
CREATE INDEX idx_rides_created_at ON rides(created_at);
CREATE INDEX idx_trips_driver_id ON trips(driver_id, ride_id);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_payments_trip ON payments(trip_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_next_retry ON payments(next_retry_at) WHERE next_retry_at IS NOT NULL AND status = 'PENDING';
CREATE INDEX idx_outbox_unprocessed ON outbox_events(processed) WHERE processed = FALSE;

-- Constraints
CREATE UNIQUE INDEX idx_unique_active_trip_per_driver ON trips(driver_id) WHERE status IN ('CREATED', 'STARTED', 'PAUSED');

-- =========================================================
-- Apply Migrations
-- =========================================================
\i /docker-entrypoint-initdb.d/migrations/001_initial_schema.sql
\i /docker-entrypoint-initdb.d/migrations/002_payment_retry_fields.sql
\i /docker-entrypoint-initdb.d/migrations/003_add_tier_payment_method.sql
\i /docker-entrypoint-initdb.d/migrations/004_state_transition_validation.sql
