-- 00048: Add Stripe IDs to transactions for refunds + dispute lookups
--
-- These columns let webhook handlers (charge.refunded, charge.dispute.created)
-- locate the affected transaction in O(1) via Stripe's IDs without having to
-- scan all PENDING/PAID transactions.
--
-- They are populated by `finalizePaidTransaction` once the buyer has paid
-- (we know the payment_intent + latest_charge from the Checkout Session).
--
-- refunded_amount is the running cumulative refund total in EUR for the
-- transaction.  refunded_at is the timestamp of the most recent refund.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text,
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(10,2) NOT NULL DEFAULT 0
    CHECK (refunded_amount >= 0),
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_transactions_payment_intent
  ON public.transactions(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_charge
  ON public.transactions(stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;
