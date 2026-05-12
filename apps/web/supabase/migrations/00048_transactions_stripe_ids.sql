-- 00048_transactions_stripe_ids.sql
--
-- Sprint 2 (Stripe best practices) — enrich transactions with the Stripe
-- Payment Intent / Charge IDs so we can:
--   • lookup transactions from refund / dispute webhooks
--     (which carry charge IDs, not session IDs)
--   • issue refunds via the admin route (refund needs payment_intent)
--   • track partial refunds without losing data
--
-- Backwards compatible: all new columns are nullable. The webhook
-- finalize() function will populate them on PAYIN_NORMAL_SUCCEEDED.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text,
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- Partial indexes — most rows have NULL Stripe IDs (legacy / pending),
-- indexing only non-NULL entries keeps the index small and the lookup fast.
CREATE INDEX IF NOT EXISTS idx_transactions_payment_intent
  ON public.transactions(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_charge
  ON public.transactions(stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;

-- Sanity check: refunded_amount should never exceed total_amount.
-- Use a CHECK that is permissive on NULL total_amount just in case.
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_refund_within_total
  CHECK (refunded_amount >= 0 AND (total_amount IS NULL OR refunded_amount <= total_amount));
