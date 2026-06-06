-- Payout history table for tracking all transfers from wallet to bank account
CREATE TYPE payout_status AS ENUM (
  'pending',    -- Just requested, transfer to connected account initiated
  'in_transit', -- Payout created, waiting for bank processing
  'paid',       -- Funds landed on seller's bank account
  'failed',     -- Payout failed (invalid IBAN, closed account, etc.)
  'canceled'    -- Payout canceled before completion
);

CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  status payout_status NOT NULL DEFAULT 'pending',
  stripe_transfer_id TEXT,
  stripe_payout_id TEXT,
  failure_code TEXT,
  failure_message TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast user history lookup (most recent first)
CREATE INDEX idx_payouts_user_id_requested_at ON payouts(user_id, requested_at DESC);

-- Index for webhook lookups
CREATE INDEX idx_payouts_stripe_payout_id ON payouts(stripe_payout_id) WHERE stripe_payout_id IS NOT NULL;

-- RLS: users can only see their own payouts
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own payouts"
  ON payouts FOR SELECT
  USING (auth.uid() = user_id);

-- Only service_role can insert/update (via API routes and webhooks)
-- No direct insert/update policy for authenticated users

-- Trigger for updated_at (uses the existing function from migration 00019)
CREATE TRIGGER set_payouts_updated_at
  BEFORE UPDATE ON payouts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
