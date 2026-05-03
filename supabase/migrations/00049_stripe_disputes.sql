-- 00049: Stripe chargebacks (bank-initiated disputes) tracking table
--
-- Distinct from the existing `disputes` table (00007) which stores
-- internal C2C disputes between buyer and seller (DAMAGED_CARD, etc.).
--
-- A "Stripe dispute" is a chargeback raised by the buyer with their
-- card-issuing bank. It bypasses our internal dispute flow and lands
-- directly via the `charge.dispute.created` webhook. Stripe gives us a
-- limited window (`evidence_due_by`) to submit evidence; failing to do
-- so by the deadline = automatic loss + the platform balance is debited.
--
-- `status` mirrors the values returned by the Stripe API for
-- `Dispute.status` (https://stripe.com/docs/api/disputes/object).
-- `outcome` captures the human-readable resolution after `closed`
-- (won, lost, charge_refunded).
--
-- RLS: only admins can read this table — sellers/buyers see their dispute
-- status indirectly through transaction.status = 'DISPUTED'. Admins use
-- the dedicated /admin/disputes page to triage and submit evidence.

CREATE TABLE IF NOT EXISTS public.stripe_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_dispute_id text UNIQUE NOT NULL,
  stripe_charge_id text NOT NULL,
  transaction_id uuid REFERENCES public.transactions(id),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'eur',
  reason text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'warning_needs_response','warning_under_review','warning_closed',
    'needs_response','under_review','charge_refunded',
    'won','lost'
  )),
  outcome text,
  evidence_due_by timestamptz,
  evidence_submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_disputes_status
  ON public.stripe_disputes(status);

CREATE INDEX IF NOT EXISTS idx_stripe_disputes_transaction
  ON public.stripe_disputes(transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_disputes_charge
  ON public.stripe_disputes(stripe_charge_id);

-- updated_at maintenance via shared trigger function from 00019
DROP TRIGGER IF EXISTS stripe_disputes_set_updated_at ON public.stripe_disputes;
CREATE TRIGGER stripe_disputes_set_updated_at
  BEFORE UPDATE ON public.stripe_disputes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.stripe_disputes ENABLE ROW LEVEL SECURITY;

-- Admin-only reads. service_role (webhooks, admin routes) bypasses RLS so
-- no INSERT/UPDATE/DELETE policy is needed for the privileged paths.
DROP POLICY IF EXISTS "stripe_disputes_admin_read" ON public.stripe_disputes;
CREATE POLICY "stripe_disputes_admin_read" ON public.stripe_disputes
  FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
