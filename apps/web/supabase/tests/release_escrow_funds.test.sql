BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(27);

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

UPDATE public.wallets
SET available_balance = 95
WHERE user_id = '10000000-0000-4000-8000-000000000002';

SELECT is(
  (SELECT available_balance FROM public.wallets
   WHERE user_id = '10000000-0000-4000-8000-000000000002'),
  95::numeric,
  'legacy wallet mutation is applied'
);
SELECT is(
  (SELECT count(*) FROM public.ledger_transactions
   WHERE journal_type = 'wallet_adjustment'),
  1::bigint,
  'legacy wallet mutation is captured as an immutable journal'
);
SELECT is(
  public.rebuild_wallet_projections(
    '10000000-0000-4000-8000-000000000002'
  ),
  1,
  'seller wallet projection is rebuilt'
);
SELECT is(
  (SELECT available_balance FROM public.wallets
   WHERE user_id = '10000000-0000-4000-8000-000000000002'),
  95::numeric,
  'projection rebuild preserves refund, dispute, or payout-style debits'
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
  'compatibility wallet journals remain balanced'
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
