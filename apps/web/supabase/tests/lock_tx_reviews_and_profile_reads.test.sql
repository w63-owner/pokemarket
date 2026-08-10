BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(13);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '81000000-0000-4000-8000-000000000001',
    'lock-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"lock_buyer"}'::jsonb
  ),
  (
    '81000000-0000-4000-8000-000000000002',
    'lock-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"lock_seller"}'::jsonb
  );

UPDATE public.profiles
SET
  address_line = '1 rue secrete',
  city = 'Paris',
  postal_code = '75001',
  stripe_customer_id = 'cus_lock_seller',
  stripe_account_id = 'acct_lock_seller',
  kyc_status = 'VERIFIED'
WHERE id = '81000000-0000-4000-8000-000000000002';

INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000002',
  'Lock regression card',
  100,
  'LOCKED'
);

INSERT INTO public.transactions (
  id,
  listing_id,
  buyer_id,
  seller_id,
  total_amount,
  fee_amount,
  shipping_cost,
  status
)
VALUES (
  '83000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000002',
  112,
  7,
  5,
  'PENDING_PAYMENT'
);

INSERT INTO public.conversations (id, listing_id, buyer_id, seller_id)
VALUES (
  '84000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000002'
);

SELECT public.finalize_paid_transaction(
  '83000000-0000-4000-8000-000000000001',
  'pi_lock_test',
  'ch_lock_test'
);

UPDATE public.transactions
SET status = 'SHIPPED', shipped_at = now()
WHERE id = '83000000-0000-4000-8000-000000000001';

-- Buyer JWT cannot skip escrow via direct status update
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
SET ROLE authenticated;

SELECT throws_ok(
  $$
    UPDATE public.transactions
       SET status = 'COMPLETED'
     WHERE id = '83000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  NULL,
  'buyer JWT cannot mark SHIPPED → COMPLETED directly'
);

SELECT throws_ok(
  $$
    UPDATE public.transactions
       SET status = 'DISPUTED'
     WHERE id = '83000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  NULL,
  'buyer JWT cannot mark SHIPPED → DISPUTED directly'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- RPC path still works and releases escrow
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT ok(
  public.release_escrow_funds(
    '83000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001'
  ),
  'release_escrow_funds still completes for the buyer'
);

SELECT is(
  (
    SELECT status
    FROM public.transactions
    WHERE id = '83000000-0000-4000-8000-000000000001'
  ),
  'COMPLETED',
  'RPC path reaches COMPLETED'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.ledger_transactions
    WHERE idempotency_key =
      'escrow-release:83000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'RPC path writes the escrow-release ledger'
);

-- Reviews: self-review blocked; legitimate buyer→seller allowed
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
SET ROLE authenticated;

SELECT throws_ok(
  $$
    INSERT INTO public.reviews (
      transaction_id, reviewer_id, reviewee_id, rating
    ) VALUES (
      '83000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000002',
      '81000000-0000-4000-8000-000000000002',
      5
    )
  $$,
  '42501',
  NULL,
  'seller cannot self-review'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
SET ROLE authenticated;

SELECT lives_ok(
  $$
    INSERT INTO public.reviews (
      transaction_id, reviewer_id, reviewee_id, rating
    ) VALUES (
      '83000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000002',
      5
    )
  $$,
  'buyer can review seller after COMPLETED'
);

-- Profiles: sensitive columns inaccessible to other users; own view works
SELECT throws_ok(
  $$
    SELECT stripe_customer_id
    FROM public.profiles
    WHERE id = '81000000-0000-4000-8000-000000000002'
  $$,
  '42501',
  NULL,
  'JWT cannot select stripe_customer_id on profiles'
);

SELECT throws_ok(
  $$
    SELECT address_line
    FROM public.profiles
    WHERE id = '81000000-0000-4000-8000-000000000002'
  $$,
  '42501',
  NULL,
  'JWT cannot select address_line on profiles'
);

SELECT is(
  (
    SELECT username
    FROM public.profiles
    WHERE id = '81000000-0000-4000-8000-000000000002'
  ),
  'lock_seller',
  'JWT can still read public profile columns'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
SET ROLE authenticated;

SELECT is(
  (
    SELECT stripe_customer_id
    FROM public.profiles_me
  ),
  'cus_lock_seller',
  'owner can read stripe_customer_id via profiles_me'
);

SELECT is(
  (
    SELECT address_line
    FROM public.profiles_me
  ),
  '1 rue secrete',
  'owner can read address via profiles_me'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.profiles_me
    WHERE id = '81000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'profiles_me never returns another user row'
);

SELECT * FROM finish();
ROLLBACK;
