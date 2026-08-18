-- Keep the financial implementation private while allowing the authenticated
-- public entry point to invoke it with the function owner's privileges.
--
-- Later hardening migrations correctly revoked authenticated access to the
-- private schema, but the public wrapper was SECURITY INVOKER. Every buyer call
-- therefore failed with SQLSTATE 42501 before the ownership checks could run.
-- auth.uid() still reads the request JWT inside SECURITY DEFINER functions, so
-- private.release_escrow_funds continues to enforce buyer ownership.
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
