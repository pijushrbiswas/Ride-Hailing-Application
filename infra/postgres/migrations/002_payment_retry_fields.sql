-- Migration: Add payment retry and PSP fields
-- Date: 2026-01-15

BEGIN;

-- Add PSP integration fields
ALTER TABLE payments 
  ADD COLUMN IF NOT EXISTS psp_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS psp_response JSONB;

-- Add retry mechanism fields
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();

-- Add indexes for payment processing
CREATE INDEX IF NOT EXISTS idx_payments_status
  ON payments(status);

CREATE INDEX IF NOT EXISTS idx_payments_next_retry
  ON payments(next_retry_at)
  WHERE next_retry_at IS NOT NULL AND status = 'PENDING';

COMMIT;
