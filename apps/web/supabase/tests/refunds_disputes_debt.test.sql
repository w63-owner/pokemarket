BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(12);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '51000000-0000-4000-8000-000000000001',
    'sprint5-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"sprint5_buyer"}'::jsonb
  ),
  (
    '51000000-0000-4000-8000-000000000002',
    'sprint5-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"sprint5_seller"}'::jsonb
  );

INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '52000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000002',
  'Sprint 5 refund card',
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
  '53000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000002',
  112,
  7,
  5,
  'PENDING_PAYMENT'
);

SELECT is(
  public.finalize_paid_transaction(
    '53000000-0000-4000-8000-000000000001',
    'pi_sprint5',
    'ch_sprint5'
  ),
  'PAID',
  'payment creates the seller pending credit'
);

SELECT lives_ok(
  $$ SELECT * FROM public.apply_stripe_refund('ch_sprint5', 500, 're_sprint5_1') $$,
  'first cumulative refund is applied'
);
SELECT is(
  (
    SELECT seller_refund_target_minor
    FROM public.transactions
    WHERE id = '53000000-0000-4000-8000-000000000001'
  ),
  500::bigint,
  'the first five euros reverse shipping exactly once'
);

SELECT lives_ok(
  $$ SELECT * FROM public.apply_stripe_refund('ch_sprint5', 2500, 're_sprint5_2') $$,
  'second cumulative partial refund is applied'
);
SELECT is(
  (
    SELECT seller_refund_target_minor
    FROM public.transactions
    WHERE id = '53000000-0000-4000-8000-000000000001'
  ),
  2369::bigint,
  'successive partial refunds use before/after seller liability'
);
SELECT is(
  (
    SELECT pending_balance
    FROM public.wallets
    WHERE user_id = '51000000-0000-4000-8000-000000000002'
  ),
  81.31::numeric,
  'wallet projection reflects the exact cumulative seller debit'
);

INSERT INTO public.stripe_disputes (
  stripe_dispute_id,
  stripe_charge_id,
  transaction_id,
  amount,
  amount_minor,
  currency,
  status,
  reason
)
VALUES (
  'dp_sprint5',
  'ch_sprint5',
  '53000000-0000-4000-8000-000000000001',
  50,
  5000,
  'EUR',
  'needs_response',
  'product_not_received'
);

SELECT ok(
  public.lock_stripe_dispute('dp_sprint5'),
  'dispute atomically locks only the remaining seller liability'
);
SELECT is(
  (
    SELECT locked_minor
    FROM public.stripe_disputes
    WHERE stripe_dispute_id = 'dp_sprint5'
  ),
  2337::bigint,
  'existing refunds are deducted from disputed seller liability'
);
SELECT ok(
  public.resolve_stripe_dispute('dp_sprint5', 'lost'),
  'lost dispute consumes locked funds'
);

SELECT lives_ok(
  $$ SELECT * FROM public.apply_stripe_refund('ch_sprint5', 5000, 're_sprint5_3') $$,
  'matching refund after a lost dispute converges'
);
SELECT is(
  (
    SELECT seller_refunded_minor
      + (
          SELECT consumed_minor
          FROM public.stripe_disputes
          WHERE stripe_dispute_id = 'dp_sprint5'
        )
    FROM public.transactions
    WHERE id = '53000000-0000-4000-8000-000000000001'
  ),
  4706::bigint,
  'refund and dispute together debit the seller only once'
);
SELECT is(
  (
    SELECT COALESCE(sum(amount_minor), 0)
    FROM public.ledger_entries
    WHERE ledger_transaction_id IN (
      SELECT id
      FROM public.ledger_transactions
      WHERE transaction_id = '53000000-0000-4000-8000-000000000001'
    )
  ),
  0::bigint,
  'all Sprint 5 journals remain balanced'
);

SELECT * FROM finish();
ROLLBACK;
