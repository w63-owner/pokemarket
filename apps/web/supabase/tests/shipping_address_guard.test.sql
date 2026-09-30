BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(5);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '81000000-0000-4000-8000-000000000001',
    'ship-addr-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"ship_addr_buyer"}'::jsonb
  ),
  (
    '81000000-0000-4000-8000-000000000002',
    'ship-addr-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"ship_addr_seller"}'::jsonb
  );

INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000002',
  'Ship address card',
  20,
  'SOLD'
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
  shipping_address_line,
  shipping_address_city,
  shipping_address_postcode,
  shipping_country
)
VALUES
  (
    '84000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000002',
    25,
    2,
    1.90,
    'PAID',
    '1 rue de la Paix',
    'Paris',
    '75001',
    'FR'
  ),
  (
    '84000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000002',
    25,
    2,
    1.90,
    'PENDING_PAYMENT',
    '1 rue de la Paix',
    'Paris',
    '75001',
    'FR'
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '81000000-0000-4000-8000-000000000001',
  true
);

SELECT throws_ok(
  $$
    UPDATE public.transactions
    SET shipping_address_line = '10 Downing Street',
        shipping_address_city = 'London',
        shipping_address_postcode = 'SW1A 2AA',
        shipping_country = 'GB'
    WHERE id = '84000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'FORBIDDEN: shipping address is fixed at checkout',
  'a buyer cannot rewrite the paid delivery address'
);

SELECT throws_ok(
  $$
    UPDATE public.transactions
    SET shipping_country = 'US'
    WHERE id = '84000000-0000-4000-8000-000000000002'
  $$,
  '42501',
  'FORBIDDEN: shipping address is fixed at checkout',
  'a buyer cannot swap country after the shipping quote is stored'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '81000000-0000-4000-8000-000000000002',
  true
);

SELECT throws_ok(
  $$
    UPDATE public.transactions
    SET shipping_address_line = 'Seller warehouse'
    WHERE id = '84000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'FORBIDDEN: shipping address is fixed at checkout',
  'a seller cannot replace the buyer delivery address'
);

SELECT lives_ok(
  $$
    UPDATE public.transactions
    SET tracking_number = 'TRACK-1'
    WHERE id = '84000000-0000-4000-8000-000000000001'
  $$,
  'a seller can still record a tracking number'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT lives_ok(
  $$
    UPDATE public.transactions
    SET shipping_address_line = '2 avenue ops',
        shipping_address_city = 'Lyon',
        shipping_address_postcode = '69001',
        shipping_country = 'FR'
    WHERE id = '84000000-0000-4000-8000-000000000001'
  $$,
  'checkout and other service-role writers can still store the address'
);

SELECT * FROM finish();
ROLLBACK;
