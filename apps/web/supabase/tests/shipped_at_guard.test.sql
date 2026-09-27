BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(5);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '71000000-0000-4000-8000-000000000001',
    'ship-clock-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"ship_clock_buyer"}'::jsonb
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    'ship-clock-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"ship_clock_seller"}'::jsonb
  );

INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002',
  'Ship clock card',
  20,
  'SOLD'
);

INSERT INTO public.conversations (id, listing_id, buyer_id, seller_id)
VALUES (
  '73000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002'
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
  '74000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002',
  25,
  2,
  3,
  'PAID'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $$
    UPDATE public.transactions
    SET status = 'SHIPPED',
        shipped_at = now() - interval '15 days'
    WHERE id = '74000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  NULL,
  'a seller cannot backdate shipped_at while marking an order shipped'
);

SELECT lives_ok(
  $$
    SELECT public.ship_order(
      '74000000-0000-4000-8000-000000000001',
      'TRACK-1',
      NULL,
      '73000000-0000-4000-8000-000000000001'
    )
  $$,
  'ship_order still records the shipment'
);

SELECT ok(
  (
    SELECT shipped_at
    FROM public.transactions
    WHERE id = '74000000-0000-4000-8000-000000000001'
  ) > now() - interval '2 minutes',
  'ship_order stores the current ship time'
);

SELECT throws_ok(
  $$
    UPDATE public.transactions
    SET shipped_at = now() - interval '15 days'
    WHERE id = '74000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  NULL,
  'a seller cannot backdate shipped_at after the order is shipped'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $$
    UPDATE public.transactions
    SET shipped_at = now() + interval '30 days'
    WHERE id = '74000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  NULL,
  'a buyer cannot postpone the escrow release clock'
);

SELECT * FROM finish();
ROLLBACK;
