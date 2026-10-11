-- Stripe customer, Connect account, and KYC status are assigned by the
-- backend. A signed-in user could previously copy another profile's
-- stripe_customer_id onto their own row (the column is publicly readable and
-- profiles_update_own allows any column). Checkout and the saved-card API
-- then issued ephemeral keys and Checkout Sessions for that customer, which
-- exposes and can charge or detach the victim's saved payment methods.
--
-- auth.uid() is NULL for the service role, so webhooks, checkout, and Connect
-- onboarding can still persist these fields.

BEGIN;

CREATE OR REPLACE FUNCTION private.guard_profile_stripe_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: stripe identity is backend-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_profile_stripe_identity()
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.guard_profile_stripe_identity()
  TO authenticated, service_role;

DROP TRIGGER IF EXISTS profiles_stripe_identity_backend_managed
  ON public.profiles;

CREATE TRIGGER profiles_stripe_identity_backend_managed
  BEFORE UPDATE OF stripe_customer_id, stripe_account_id, kyc_status
  ON public.profiles
  FOR EACH ROW
  WHEN (
    OLD.stripe_customer_id IS DISTINCT FROM NEW.stripe_customer_id
    OR OLD.stripe_account_id IS DISTINCT FROM NEW.stripe_account_id
    OR OLD.kyc_status IS DISTINCT FROM NEW.kyc_status
  )
  EXECUTE FUNCTION private.guard_profile_stripe_identity();

COMMIT;
