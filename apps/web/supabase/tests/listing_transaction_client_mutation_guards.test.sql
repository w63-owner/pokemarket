BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(12);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '71000000-0000-4000-8000-000000000001',
    'guard-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"guard_buyer"}'::jsonb
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    'guard-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"guard_seller"}'::jsonb
  );

INSERT INTO public.listings (
  id, seller_id, title, price_seller, status, reserved_for, reserved_price
)
VALUES
  (
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002',
    'Sold card must stay sold',
    50,
    'SOLD',
    '71000000-0000-4000-8000-000000000001',
    50
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'Active card editable metadata',
    40,
    'ACTIVE',
    NULL,
    NULL
  );

INSERT INTO public.transactions (
  id,
  listing_id,
  buyer_id,
  seller_id,
  total_amount,
  fee_amount,
  shipping_cost,
  status,
  stripe_payment_intent_id
)
VALUES
  (
    '73000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002',
    60,
    5,
    5,
    'PENDING_PAYMENT',
    'pi_test_guard_1'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002',
    50,
    4,
    5,
    'PAID',
    'pi_test_guard_2'
  ),
  (
    '73000000-0000-4000-8000-000000000003',
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002',
    50,
    4,
    5,
    'SHIPPED',
    'pi_test_guard_3'
  );

-- Seller JWT: cannot reactivate a SOLD listing
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $$
    UPDATE public.listings
       SET status = 'ACTIVE',
           reserved_for = NULL,
           reserved_price = NULL
     WHERE id = '72000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'FORBIDDEN: listing availability fields are backend-managed',
  'seller cannot relist a SOLD listing via PostgREST'
);

SELECT lives_ok(
  $$
    UPDATE public.listings
       SET title = 'Active card retitled'
     WHERE id = '72000000-0000-4000-8000-000000000002'
  $$,
  'seller can still edit metadata on an ACTIVE listing'
);

-- Buyer JWT: cannot forge payment settlement
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $$
    UPDATE public.transactions
       SET status = 'PAID'
     WHERE id = '73000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'FORBIDDEN: invalid transaction status transition PENDING_PAYMENT → PAID',
  'buyer cannot forge PENDING_PAYMENT → PAID'
);

SELECT throws_ok(
  $$
    UPDATE public.transactions
       SET total_amount = 1
     WHERE id = '73000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'FORBIDDEN: transaction financial fields are backend-managed',
  'buyer cannot rewrite total_amount'
);

SELECT throws_ok(
  $$
    UPDATE public.transactions
       SET stripe_payment_intent_id = 'pi_hijacked'
     WHERE id = '73000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'FORBIDDEN: transaction financial fields are backend-managed',
  'buyer cannot rewrite stripe_payment_intent_id'
);

-- Seller JWT: PAID → COMPLETED skip-ahead blocked; PAID → SHIPPED still ok
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $$
    UPDATE public.transactions
       SET status = 'COMPLETED'
     WHERE id = '73000000-0000-4000-8000-000000000002'
  $$,
  '42501',
  'FORBIDDEN: invalid transaction status transition PAID → COMPLETED',
  'seller cannot skip shipping by marking COMPLETED'
);

SELECT lives_ok(
  $$
    UPDATE public.transactions
       SET status = 'SHIPPED',
           tracking_number = 'TRACK-GUARD-1',
           shipped_at = now()
     WHERE id = '73000000-0000-4000-8000-000000000002'
  $$,
  'seller can still perform PAID → SHIPPED'
);

-- Buyer JWT: SHIPPED → COMPLETED remains allowed for escrow release path
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $$
    UPDATE public.transactions
       SET status = 'COMPLETED'
     WHERE id = '73000000-0000-4000-8000-000000000003'
  $$,
  'buyer can still confirm reception SHIPPED → COMPLETED'
);

RESET ROLE;

-- service_role / uid-null backend can relist and settle as before
SELECT lives_ok(
  $$
    UPDATE public.listings
       SET status = 'ACTIVE',
           reserved_for = NULL,
           reserved_price = NULL
     WHERE id = '72000000-0000-4000-8000-000000000001'
  $$,
  'backend can update listing availability fields'
);

SELECT lives_ok(
  $$
    UPDATE public.transactions
       SET status = 'PAID'
     WHERE id = '73000000-0000-4000-8000-000000000001'
  $$,
  'backend can settle PENDING_PAYMENT → PAID'
);

SELECT is(
  (SELECT status FROM public.listings
    WHERE id = '72000000-0000-4000-8000-000000000001'),
  'ACTIVE',
  'backend relist persisted'
);

SELECT is(
  (SELECT status FROM public.transactions
    WHERE id = '73000000-0000-4000-8000-000000000001'),
  'PAID',
  'backend settlement persisted'
);

SELECT * FROM finish();
ROLLBACK;
