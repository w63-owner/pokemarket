-- Prevent JWT clients from rewriting Stripe identity / KYC fields on profiles.
--
-- `profiles_update_own` allows any column update. Combined with
-- `profiles_select_public` (USING true), any authenticated user can read
-- another user's `stripe_customer_id` and copy it onto their own row.
-- Checkout then creates PaymentIntents / Checkout Sessions against the
-- victim's Stripe Customer (and mobile ephemeral keys expose saved cards).
--
-- Same class of risk for `stripe_account_id` (Connect destination) and
-- forged `kyc_status`. Backend writers use service_role (auth.uid() IS NULL)
-- and remain unrestricted — matching `profiles_role_immutable_for_users`.

CREATE OR REPLACE FUNCTION private.guard_profile_stripe_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
    OR NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
    OR NEW.kyc_status IS DISTINCT FROM OLD.kyc_status
  ) THEN
    RAISE EXCEPTION
      'FORBIDDEN: Stripe customer/account/KYC fields are backend-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_stripe_fields_immutable_for_users ON public.profiles;

CREATE TRIGGER profiles_stripe_fields_immutable_for_users
  BEFORE UPDATE OF stripe_customer_id, stripe_account_id, kyc_status
  ON public.profiles
  FOR EACH ROW
  WHEN (
    OLD.stripe_customer_id IS DISTINCT FROM NEW.stripe_customer_id
    OR OLD.stripe_account_id IS DISTINCT FROM NEW.stripe_account_id
    OR OLD.kyc_status IS DISTINCT FROM NEW.kyc_status
  )
  EXECUTE FUNCTION private.guard_profile_stripe_fields();

-- One Stripe Customer must map to at most one profile (blocks shared-customer
-- races even if a future writer forgets the trigger).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_customer_id_unique
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

REVOKE ALL ON FUNCTION private.guard_profile_stripe_fields()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_profile_stripe_fields()
  TO service_role;
