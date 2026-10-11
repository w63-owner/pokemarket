BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES (
  '71000000-0000-4000-8000-000000000001',
  'stripe-identity@example.test',
  'authenticated',
  'authenticated',
  '{"username":"stripe_identity"}'::jsonb
);

SELECT set_config('request.jwt.claim.sub', '', true);

UPDATE public.profiles
SET stripe_customer_id = 'cus_backend'
WHERE id = '71000000-0000-4000-8000-000000000001';

SELECT is(
  stripe_customer_id,
  'cus_backend',
  'service role can persist stripe_customer_id'
)
FROM public.profiles
WHERE id = '71000000-0000-4000-8000-000000000001';

SELECT set_config(
  'request.jwt.claim.sub',
  '71000000-0000-4000-8000-000000000001',
  true
);

SELECT throws_ok(
  $$
    UPDATE public.profiles
    SET stripe_customer_id = 'cus_victim'
    WHERE id = '71000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'FORBIDDEN: stripe identity is backend-managed',
  'JWT cannot rewrite stripe_customer_id'
);

SELECT throws_ok(
  $$
    UPDATE public.profiles
    SET stripe_account_id = 'acct_victim'
    WHERE id = '71000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'FORBIDDEN: stripe identity is backend-managed',
  'JWT cannot rewrite stripe_account_id'
);

SELECT throws_ok(
  $$
    UPDATE public.profiles
    SET kyc_status = 'VERIFIED'
    WHERE id = '71000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'FORBIDDEN: stripe identity is backend-managed',
  'JWT cannot self-verify KYC'
);

SELECT * FROM finish();
ROLLBACK;
