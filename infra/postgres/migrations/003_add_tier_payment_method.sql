-- Migration: Add tier and payment method to rides
-- Date: 2026-01-15

BEGIN;

-- Add new enums
DO $$ BEGIN
  CREATE TYPE ride_tier AS ENUM ('ECONOMY', 'PREMIUM', 'LUXURY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('CARD', 'CASH', 'WALLET', 'UPI');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add columns to rides table
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS tier ride_tier NOT NULL DEFAULT 'ECONOMY',
  ADD COLUMN IF NOT EXISTS payment_method payment_method NOT NULL DEFAULT 'CARD';

COMMIT;
