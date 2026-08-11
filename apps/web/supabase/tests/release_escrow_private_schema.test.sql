BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(6);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    'a1000000-0000-4000-8000-000000000001',
    'escrow-schema-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"escrow_schema_buyer"}'::jsonb
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'escrow-schema-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"escrow_schema_seller"}'::jsonb
  );

INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'Escrow schema regression card',
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
  'a3000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  112,
  7,
  5,
  'PENDING_PAYMENT'
);

SELECT is(
  public.finalize_paid_transaction(
    'a3000000-0000-4000-8000-000000000001',
    'pi_escrow_schema',
    'ch_escrow_schema'
  ),
  'PAID',
  'payment finalization succeeds for schema regression fixture'
);

UPDATE public.transactions
SET status = 'SHIPPED', shipped_at = now()
WHERE id = 'a3000000-0000-4000-8000-000000000001';

SELECT ok(
  NOT has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated must not retain blanket USAGE on schema private'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.release_escrow_funds(uuid,uuid)',
    'execute'
  ),
  'authenticated may execute the public escrow release entry point'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'private.release_escrow_funds(uuid,uuid)',
    'execute'
  ),
  'authenticated cannot execute private.release_escrow_funds directly'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT ok(
  public.release_escrow_funds(
    'a3000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001'
  ),
  'buyer JWT can release escrow without USAGE on schema private'
);

RESET ROLE;

SELECT is(
  (SELECT status FROM public.transactions
   WHERE id = 'a3000000-0000-4000-8000-000000000001'),
  'COMPLETED',
  'buyer JWT escrow release completes the transaction'
);

SELECT * FROM finish();
ROLLBACK;
