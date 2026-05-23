-- 00049_stripe_disputes.sql
--
-- Sprint 2 (Stripe best practices) — track Stripe chargebacks (bank-initiated
-- disputes) separately from PokeMarket's internal C2C disputes.
--
-- Why a separate table from `disputes` (00007_reviews_disputes.sql)?
--   • Different lifecycle: chargebacks have a hard deadline (`evidence_due_by`)
--     and are mediated by Stripe + the issuing bank, not by us.
--   • Different statuses: Stripe uses `warning_needs_response`,
--     `under_review`, `won`, `lost`, etc. — none of which match our internal
--     OPEN/IN_REVIEW/RESOLVED.
--   • Different actors: chargebacks involve admin + Stripe (we submit
--     evidence). Internal disputes involve buyer + seller + admin.
--
-- The two tables are joined to the same `transactions.id` so the admin UI
-- can show both kinds of dispute in a single transaction view.

CREATE TABLE IF NOT EXISTS public.stripe_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stripe's `du_xxx` identifier. UNIQUE so charge.dispute.* webhook replays
  -- become no-ops at the DB level.
  stripe_dispute_id text UNIQUE NOT NULL,
  -- Stripe `ch_xxx`. Joined to transactions via stripe_charge_id.
  stripe_charge_id text NOT NULL,
  -- Soft FK — disputes for transactions we've cleaned up still survive.
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,

  amount numeric(10,2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'EUR',

  -- Mirrors Stripe's Dispute.status field.
  -- See https://stripe.com/docs/api/disputes/object#dispute_object-status
  status text NOT NULL CHECK (status IN (
    'warning_needs_response',
    'warning_under_review',
    'warning_closed',
    'needs_response',
    'under_review',
    'charge_refunded',
    'won',
    'lost'
  )),
  -- Stripe Dispute.reason — free-form lowercase string from Stripe
  -- (e.g. "fraudulent", "product_not_received").
  reason text,

  -- When Stripe expects our evidence (UTC). Always present at creation,
  -- typically ~7-21 days out depending on the issuing bank.
  evidence_due_by timestamptz,
  evidence_submitted_at timestamptz,

  -- Populated when the dispute closes (won/lost/charge_refunded).
  outcome text,
  outcome_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_disputes_status
  ON public.stripe_disputes(status);

CREATE INDEX IF NOT EXISTS idx_stripe_disputes_transaction
  ON public.stripe_disputes(transaction_id)
  WHERE transaction_id IS NOT NULL;

-- Open disputes (need admin action) sorted by deadline urgency.
-- Used by the admin disputes page to surface most urgent chargebacks first.
CREATE INDEX IF NOT EXISTS idx_stripe_disputes_open_by_deadline
  ON public.stripe_disputes(evidence_due_by ASC)
  WHERE status IN ('warning_needs_response', 'needs_response');

ALTER TABLE public.stripe_disputes ENABLE ROW LEVEL SECURITY;

-- Only admins can read disputes. Sellers will get notified via emails / push,
-- but they don't see the chargeback details in their UI (Stripe handles the
-- consumer side, and exposing chargeback meta to a flagged seller could
-- compromise our investigation).
CREATE POLICY "Admins read all stripe disputes" ON public.stripe_disputes
  FOR SELECT
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Reuse the same updated_at trigger as the rest of the schema (defined in
-- 00019_trigger_updated_at.sql).
CREATE TRIGGER set_stripe_disputes_updated_at
  BEFORE UPDATE ON public.stripe_disputes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
