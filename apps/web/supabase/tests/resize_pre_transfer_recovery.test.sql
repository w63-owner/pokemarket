BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(12);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '61000000-0000-4000-8000-000000000001',
    'resize-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"resize_buyer"}'::jsonb
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    'resize-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"resize_seller"}'::jsonb
  );

UPDATE public.profiles
SET stripe_account_id = 'acct_resize'
WHERE id = '61000000-0000-4000-8000-000000000002';

INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  'Resize recovery card',
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
  '63000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  112,
  7,
  5,
  'PENDING_PAYMENT'
);

SELECT is(
  public.finalize_paid_transaction(
    '63000000-0000-4000-8000-000000000001',
    'pi_resize',
    'ch_resize'
  ),
  'PAID',
  'payment credits seller pending'
);

-- Partial refund before escrow release must not brick release_escrow.
SELECT lives_ok(
  $$ SELECT * FROM public.apply_stripe_refund('ch_resize', 500, 're_resize_1') $$,
  'partial shipping refund before escrow release applies'
);

UPDATE public.transactions
SET status = 'SHIPPED'
WHERE id = '63000000-0000-4000-8000-000000000001';

SELECT ok(
  public.release_escrow_funds(
    '63000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001'
  ),
  'escrow release succeeds after partial pre-release refund'
);

SELECT is(
  (
    SELECT (payload ->> 'amount_minor')::bigint
    FROM public.financial_outbox
    WHERE idempotency_key =
      'transfer-requested:63000000-0000-4000-8000-000000000001'
  ),
  10000::bigint,
  'transfer outbox amount matches residual seller funds'
);

SELECT is(
  (
    SELECT amount_minor
    FROM public.seller_transfers
    WHERE transaction_id = '63000000-0000-4000-8000-000000000001'
  ),
  10000::bigint,
  'seller_transfers row is created for the residual amount'
);

-- Another partial refund after release resizes instead of canceling.
SELECT lives_ok(
  $$ SELECT * FROM public.apply_stripe_refund('ch_resize', 2500, 're_resize_2') $$,
  'second partial refund after escrow release applies'
);

SELECT is(
  (
    SELECT amount_minor
    FROM public.seller_transfers
    WHERE transaction_id = '63000000-0000-4000-8000-000000000001'
  ),
  8131::bigint,
  'post-release partial refund resizes the queued transfer'
);

SELECT is(
  (
    SELECT cancellation_requested_at
    FROM public.seller_transfers
    WHERE transaction_id = '63000000-0000-4000-8000-000000000001'
  ),
  NULL::timestamptz,
  'residual transfer is not canceled'
);

SELECT is(
  (
    SELECT status
    FROM public.financial_outbox
    WHERE idempotency_key =
      'transfer-requested:63000000-0000-4000-8000-000000000001'
  ),
  'PENDING',
  'residual transfer job stays reclaimable'
);

-- Full refund cancels the remainder.
SELECT lives_ok(
  $$ SELECT * FROM public.apply_stripe_refund('ch_resize', 11200, 're_resize_full') $$,
  'full refund after residual resize applies'
);

SELECT isnt(
  (
    SELECT cancellation_requested_at
    FROM public.seller_transfers
    WHERE transaction_id = '63000000-0000-4000-8000-000000000001'
  ),
  NULL::timestamptz,
  'full refund cancels the residual queued transfer'
);

SELECT is(
  (
    SELECT status
    FROM public.financial_outbox
    WHERE idempotency_key =
      'transfer-requested:63000000-0000-4000-8000-000000000001'
  ),
  'COMPLETED',
  'canceled residual transfer job cannot be reclaimed'
);

SELECT * FROM finish();
ROLLBACK;
