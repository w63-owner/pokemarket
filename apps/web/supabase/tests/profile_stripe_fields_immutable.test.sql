BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(6);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '81000000-0000-4000-8000-000000000001',
    'stripe-victim@example.test',
    'authenticated',
    'authenticated',
    '{"username":"stripe_victim"}'::jsonb
  ),
  (
    '81000000-0000-4000-8000-000000000002',
    'stripe-attacker@example.test',
    'authenticated',
    'authenticated',
    '{"username":"stripe_attacker"}'::jsonb
  );

-- Backend (service_role / auth.uid() null) can bind Stripe ids.
UPDATE public.profiles
SET stripe_customer_id = 'cus_victim_test',
    stripe_account_id = 'acct_victim_test',
    kyc_status = 'VERIFIED'
WHERE id = '81000000-0000-4000-8000-000000000001';

SELECT is(
  (
    SELECT stripe_customer_id
    FROM public.profiles
    WHERE id = '81000000-0000-4000-8000-000000000001'
  ),
  'cus_victim_test',
  'service_role can set stripe_customer_id'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

-- Attacker JWT cannot copy the victim's Stripe Customer onto their profile.
SELECT throws_ok(
  $$
    UPDATE public.profiles
    SET stripe_customer_id = 'cus_victim_test'
    WHERE id = '81000000-0000-4000-8000-000000000002'
  $$,
  '42501',
  'FORBIDDEN: Stripe customer/account/KYC fields are backend-managed',
  'JWT cannot hijack another user stripe_customer_id'
);

-- Attacker JWT cannot forge Connect account or KYC.
SELECT throws_ok(
  $$
    UPDATE public.profiles
    SET stripe_account_id = 'acct_attacker_forged',
        kyc_status = 'VERIFIED'
    WHERE id = '81000000-0000-4000-8000-000000000002'
  $$,
  '42501',
  'FORBIDDEN: Stripe customer/account/KYC fields are backend-managed',
  'JWT cannot forge stripe_account_id or kyc_status'
);

-- Harmless profile fields remain writable for the owner.
SELECT lives_ok(
  $$
    UPDATE public.profiles
    SET bio = 'still allowed'
    WHERE id = '81000000-0000-4000-8000-000000000002'
  $$,
  'JWT can still update non-Stripe profile fields'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- Victim cannot clear their own Stripe bindings via JWT either.
SELECT throws_ok(
  $$
    UPDATE public.profiles
    SET stripe_customer_id = NULL,
        stripe_account_id = NULL
    WHERE id = '81000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'FORBIDDEN: Stripe customer/account/KYC fields are backend-managed',
  'JWT cannot clear own Stripe bindings'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- Unique customer binding: second profile cannot share the same customer id
-- even under service_role.
SELECT throws_ok(
  $$
    UPDATE public.profiles
    SET stripe_customer_id = 'cus_victim_test'
    WHERE id = '81000000-0000-4000-8000-000000000002'
  $$,
  '23505',
  NULL,
  'stripe_customer_id is unique across profiles'
);

SELECT * FROM finish();
ROLLBACK;
