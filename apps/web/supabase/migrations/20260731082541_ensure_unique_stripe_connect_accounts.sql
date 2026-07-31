-- A Stripe connected account belongs to exactly one PokeMarket profile.
-- Together with the deterministic Stripe idempotency key used at account
-- creation, this prevents concurrent onboarding retries from linking the same
-- account to multiple sellers.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_account_id_unique
  ON public.profiles (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;;
