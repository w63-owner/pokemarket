-- 00058_harden_refund_and_dispute_wallet_locks.sql
--
-- Persist enough state on stripe_disputes so charge.dispute.closed can
-- restore the exact wallet buckets that charge.dispute.created locked,
-- and return the transaction to its pre-dispute lifecycle status.
--
-- Why:
--   After release_escrow_funds, seller funds live in available_balance.
--   The previous dispute.created handler only decremented pending_balance,
--   so COMPLETED chargebacks locked nothing. On won, it always credited
--   pending_balance and forced status back to PAID — minting wallet balance
--   and regressing a completed order.

ALTER TABLE public.stripe_disputes
  ADD COLUMN IF NOT EXISTS previous_transaction_status text,
  ADD COLUMN IF NOT EXISTS locked_from_pending numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_from_available numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS funds_restored boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stripe_disputes.previous_transaction_status IS
  'transactions.status at charge.dispute.created time; restored on won/warning_closed';

COMMENT ON COLUMN public.stripe_disputes.locked_from_pending IS
  'EUR amount subtracted from wallets.pending_balance when the dispute opened';

COMMENT ON COLUMN public.stripe_disputes.locked_from_available IS
  'EUR amount subtracted from wallets.available_balance when the dispute opened';

COMMENT ON COLUMN public.stripe_disputes.funds_restored IS
  'True after a won/warning_closed handler has credited locked funds back to the wallet';
