-- Messaging scale migration `20260731161850` revoked USAGE on schema `private`
-- from `authenticated` (to contain `private.anonymize_account`). That broke
-- buyer confirm-reception: `public.release_escrow_funds` was a SECURITY
-- INVOKER SQL wrapper that must resolve `private.release_escrow_funds` under
-- the caller's privileges, so JWT buyers failed with
-- "permission denied for schema private". Escrow then stayed in seller_pending
-- until the service_role auto-complete cron (14 days).
--
-- Fix: make the public wrapper SECURITY DEFINER (auth checks remain inside
-- private.release_escrow_funds via auth.uid()) and keep authenticated out of
-- the private schema entirely.

CREATE OR REPLACE FUNCTION public.release_escrow_funds(
  p_transaction_id uuid,
  p_buyer_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.release_escrow_funds(p_transaction_id, p_buyer_id);
$$;

REVOKE ALL ON FUNCTION public.release_escrow_funds(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.release_escrow_funds(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.release_escrow_funds(uuid, uuid)
  TO service_role;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
