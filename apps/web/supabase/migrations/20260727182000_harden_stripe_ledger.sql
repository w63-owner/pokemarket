-- Follow-up hardening discovered by Supabase advisors after the Sprint 2
-- migration was exercised on staging.

-- This permissive policy never restricted the existing owner update policy.
-- Role changes are now rejected by profiles_role_immutable_for_users instead.
DROP POLICY IF EXISTS "Users cannot change their own role"
  ON public.profiles;

CREATE INDEX financial_outbox_aggregate_id_idx
  ON public.financial_outbox (aggregate_id);

CREATE INDEX ledger_accounts_transaction_id_idx
  ON public.ledger_accounts (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE INDEX ledger_transactions_transaction_id_idx
  ON public.ledger_transactions (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE INDEX stripe_object_bindings_ledger_transaction_id_idx
  ON public.stripe_object_bindings (ledger_transaction_id);
