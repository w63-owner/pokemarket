BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(31);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    'ledger-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"ledger_buyer"}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'ledger-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"ledger_seller"}'::jsonb
  );

INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'Ledger regression card',
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
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  112,
  7,
  5,
  'PENDING_PAYMENT'
);

SELECT is(
  public.finalize_paid_transaction(
    '30000000-0000-4000-8000-000000000001',
    NULL,
    NULL
  ),
  'PAID',
  'payment finalization succeeds'
);
SELECT is(
  (SELECT status FROM public.transactions
   WHERE id = '30000000-0000-4000-8000-000000000001'),
  'PAID',
  'transaction is paid atomically'
);
SELECT is(
  (SELECT status FROM public.listings
   WHERE id = '20000000-0000-4000-8000-000000000001'),
  'SOLD',
  'listing is sold atomically'
);
SELECT is(
  (SELECT pending_balance FROM public.wallets
   WHERE user_id = '10000000-0000-4000-8000-000000000002'),
  105::numeric,
  'wallet pending projection includes shipping and excludes only the fee'
);
SELECT is(
  (SELECT count(*) FROM public.ledger_transactions
   WHERE idempotency_key = 'payment:30000000-0000-4000-8000-000000000001'),
  1::bigint,
  'one payment journal exists'
);
SELECT is(
  (
    SELECT sum(e.amount_minor)
    FROM public.ledger_entries e
    JOIN public.ledger_transactions t
      ON t.id = e.ledger_transaction_id
    WHERE t.idempotency_key =
      'payment:30000000-0000-4000-8000-000000000001'
  ),
  0::numeric,
  'payment journal is balanced'
);
SELECT is(
  public.finalize_paid_transaction(
    '30000000-0000-4000-8000-000000000001',
    'pi_ledger_test',
    'ch_ledger_test'
  ),
  'ALREADY_PROCESSED',
  'payment finalization replay is idempotent'
);
SELECT is(
  (SELECT count(*) FROM public.ledger_transactions
   WHERE transaction_id = '30000000-0000-4000-8000-000000000001'),
  1::bigint,
  'payment replay creates no duplicate journal'
);
SELECT is(
  (SELECT stripe_charge_id FROM public.transactions
   WHERE id = '30000000-0000-4000-8000-000000000001'),
  'ch_ledger_test',
  'payment replay backfills a missing Stripe charge identifier'
);
SELECT is(
  (SELECT count(*) FROM public.stripe_object_bindings
   WHERE transaction_id = '30000000-0000-4000-8000-000000000001'),
  2::bigint,
  'Stripe identifiers are appended as immutable bindings'
);

UPDATE public.transactions
SET status = 'SHIPPED', shipped_at = now()
WHERE id = '30000000-0000-4000-8000-000000000001';

SELECT ok(
  public.release_escrow_funds(
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  ),
  'escrow release succeeds'
);
SELECT is(
  (SELECT status FROM public.transactions
   WHERE id = '30000000-0000-4000-8000-000000000001'),
  'COMPLETED',
  'transaction completes with escrow release'
);
SELECT is(
  (SELECT pending_balance FROM public.wallets
   WHERE user_id = '10000000-0000-4000-8000-000000000002'),
  0::numeric,
  'pending projection is cleared'
);
SELECT is(
  (SELECT available_balance FROM public.wallets
   WHERE user_id = '10000000-0000-4000-8000-000000000002'),
  105::numeric,
  'available projection receives the complete seller amount'
);
SELECT is(
  (SELECT count(*) FROM public.financial_outbox
   WHERE idempotency_key =
     'transfer-requested:30000000-0000-4000-8000-000000000001'),
  1::bigint,
  'a durable transfer job is created atomically'
);
SELECT is(
  (
    SELECT count(*)
    FROM (
      SELECT ledger_transaction_id
      FROM public.ledger_entries
      GROUP BY ledger_transaction_id
      HAVING sum(amount_minor) <> 0
    ) unbalanced
  ),
  0::bigint,
  'every ledger journal is balanced'
);
SELECT ok(
  public.release_escrow_funds(
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  ),
  'escrow release replay succeeds without duplicating money'
);
SELECT is(
  (SELECT count(*) FROM public.ledger_transactions
   WHERE idempotency_key =
     'escrow-release:30000000-0000-4000-8000-000000000001'),
  1::bigint,
  'escrow replay creates no duplicate journal'
);
SELECT throws_ok(
  $$UPDATE public.ledger_entries SET amount_minor = 1$$,
  '55000',
  'IMMUTABLE_LEDGER: UPDATE on public.ledger_entries is forbidden',
  'ledger entries cannot be mutated'
);

-- Direct wallet write is now forbidden: the ledger is the sole source of truth.
SELECT throws_ok(
  $$UPDATE public.wallets
    SET available_balance = 95
    WHERE user_id = '10000000-0000-4000-8000-000000000002'$$,
  '55000',
  'WALLET_DIRECT_WRITE_FORBIDDEN: wallet balances are managed exclusively by the ledger. Call private.rebuild_wallet_projection() to resync.',
  'direct wallet write is rejected after ledger lock migration'
);

-- Projection rebuild via the proper function is still allowed.
SELECT is(
  public.rebuild_wallet_projections(
    '10000000-0000-4000-8000-000000000002'
  ),
  1,
  'seller wallet projection is rebuilt via ledger replay'
);
SELECT is(
  (SELECT available_balance FROM public.wallets
   WHERE user_id = '10000000-0000-4000-8000-000000000002'),
  105::numeric,
  'projection rebuild yields correct available balance from ledger'
);
SELECT is(
  (
    SELECT count(*)
    FROM (
      SELECT ledger_transaction_id
      FROM public.ledger_entries
      GROUP BY ledger_transaction_id
      HAVING sum(amount_minor) <> 0
    ) unbalanced
  ),
  0::bigint,
  'all ledger journals remain balanced after rebuild'
);

-- Negative case: ESCROW_BALANCE_MISMATCH —
-- Create a transaction whose payment journal only credits 80 minor pending
-- for a seller, while the transaction expects 90 minor (total 100, fee 10).
INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES (
  '10000000-0000-4000-8000-000000000003',
  'ledger-mismatch-seller@example.test',
  'authenticated',
  'authenticated',
  '{"username":"mismatch_seller"}'::jsonb
);
INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '20000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  'Mismatch card',
  100,
  'SOLD'
);
INSERT INTO public.transactions (
  id, listing_id, buyer_id, seller_id,
  total_amount, fee_amount, shipping_cost, status
)
VALUES (
  '30000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  100, 10, 0, 'SHIPPED'
);
-- Insert a payment journal crediting only 80 minor (< required 9000 minor).
DO $$
DECLARE
  v_ltx_id uuid;
  v_pending_account_id uuid;
  v_platform_account_id uuid;
BEGIN
  INSERT INTO public.ledger_transactions (
    transaction_id, journal_type, idempotency_key, business_reference
  )
  VALUES (
    '30000000-0000-4000-8000-000000000002',
    'payment_captured',
    'payment:30000000-0000-4000-8000-000000000002',
    'order-payment:30000000-0000-4000-8000-000000000002'
  )
  RETURNING id INTO v_ltx_id;

  v_pending_account_id := private.get_or_create_ledger_account(
    'seller_pending', '10000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000002', 'EUR'
  );
  v_platform_account_id := private.get_or_create_ledger_account(
    'platform_cash', NULL, NULL, 'EUR'
  );

  -- Only credit 80 minor (= 0.80 EUR) instead of the required 9000 minor.
  INSERT INTO public.ledger_entries (ledger_transaction_id, account_id, amount_minor)
  VALUES
    (v_ltx_id, v_pending_account_id, 80),
    (v_ltx_id, v_platform_account_id, -80);
END;
$$;

SELECT throws_ok(
  $$SELECT public.release_escrow_funds(
      '30000000-0000-4000-8000-000000000002'::uuid,
      '10000000-0000-4000-8000-000000000001'::uuid
    )$$,
  'P0001',
  NULL,
  'release_escrow_funds raises ESCROW_BALANCE_MISMATCH when pending < required'
);

-- Negative case: MISSING_PAYMENT_LEDGER —
-- A SHIPPED transaction with no payment journal must be blocked.
INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES (
  '10000000-0000-4000-8000-000000000004',
  'ledger-nopayment-seller@example.test',
  'authenticated',
  'authenticated',
  '{"username":"nopayment_seller"}'::jsonb
);
INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '20000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  'No-payment card',
  50,
  'SOLD'
);
INSERT INTO public.transactions (
  id, listing_id, buyer_id, seller_id,
  total_amount, fee_amount, shipping_cost, status
)
VALUES (
  '30000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004',
  50, 5, 0, 'SHIPPED'
);
SELECT throws_ok(
  $$SELECT public.release_escrow_funds(
      '30000000-0000-4000-8000-000000000003'::uuid,
      '10000000-0000-4000-8000-000000000001'::uuid
    )$$,
  'P0001',
  NULL,
  'release_escrow_funds raises MISSING_PAYMENT_LEDGER for transaction without payment journal'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.claim_financial_outbox(
      ARRAY['payment_finalized'],
      1,
      120
    )
  ),
  1::bigint,
  'financial worker atomically claims a due event'
);
SELECT is(
  public.complete_financial_outbox(
    (
      SELECT id
      FROM public.financial_outbox
      WHERE idempotency_key =
        'payment-finalized:30000000-0000-4000-8000-000000000001'
    ),
    gen_random_uuid()
  ),
  false,
  'stale worker cannot acknowledge another lease'
);
SELECT ok(
  (
    SELECT public.complete_financial_outbox(id, lease_token)
    FROM public.financial_outbox
    WHERE idempotency_key =
      'payment-finalized:30000000-0000-4000-8000-000000000001'
  ),
  'current lease owner can acknowledge its event'
);

SELECT * FROM finish();
ROLLBACK;
