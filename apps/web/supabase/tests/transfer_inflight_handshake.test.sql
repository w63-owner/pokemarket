BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(5);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '61000000-0000-4000-8000-000000000001',
    'inflight-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"inflight_buyer"}'::jsonb
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    'inflight-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"inflight_seller"}'::jsonb
  );

UPDATE public.profiles
SET stripe_account_id = 'acct_inflight'
WHERE id = '61000000-0000-4000-8000-000000000002';

INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  'In-flight transfer card',
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
  status,
  stripe_charge_id
)
VALUES (
  '63000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  112,
  7,
  5,
  'PAID',
  'ch_inflight'
);

INSERT INTO public.seller_transfers (
  transaction_id,
  seller_id,
  amount_minor,
  currency,
  status,
  stripe_account_id,
  source_charge_id,
  transfer_group,
  idempotency_key,
  execution_started_at
)
VALUES (
  '63000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  10500,
  'EUR',
  'processing',
  'acct_inflight',
  'ch_inflight',
  'order_63000000-0000-4000-8000-000000000001',
  'transfer:63000000-0000-4000-8000-000000000001',
  now()
);

SELECT throws_ok(
  $$SELECT * FROM public.prepare_seller_transfer(
    '63000000-0000-4000-8000-000000000001'
  )$$,
  '40001',
  NULL,
  'prepare refuses to reclaim a live in-flight transfer handshake'
);

SELECT throws_ok(
  $$UPDATE public.transactions
    SET seller_refund_target_minor = 10500
    WHERE id = '63000000-0000-4000-8000-000000000001'$$,
  '40001',
  NULL,
  'refund cancel retries while the Stripe transfer handshake is live'
);

SELECT ok(
  public.record_seller_transfer_failure(
    '63000000-0000-4000-8000-000000000001',
    'balance_insufficient',
    'insufficient funds'
  ),
  'confirmed Stripe failure is recorded'
);

SELECT is(
  (
    SELECT execution_started_at
    FROM public.seller_transfers
    WHERE transaction_id = '63000000-0000-4000-8000-000000000001'
  ),
  NULL,
  'failure clears the in-flight handshake so refunds are not stuck forever'
);

SELECT lives_ok(
  $$UPDATE public.transactions
    SET seller_refund_target_minor = 10500
    WHERE id = '63000000-0000-4000-8000-000000000001'$$,
  'refund cancel proceeds after the failed handshake is cleared'
);

SELECT * FROM finish();
ROLLBACK;
