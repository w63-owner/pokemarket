BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(12);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '61000000-0000-4000-8000-000000000001',
    'money-path-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"money_path_buyer"}'::jsonb
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    'money-path-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"money_path_seller"}'::jsonb
  );

INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  'Money path card',
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
  stripe_charge_id,
  stripe_payment_intent_id
)
VALUES (
  '63000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  112,
  7,
  5,
  'COMPLETED',
  'ch_money_path',
  'pi_money_path'
);

-- Seed a transferred Connect credit with ledger balances.
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
  stripe_transfer_id,
  transferred_at
)
VALUES (
  '63000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  10500,
  'EUR',
  'transferred',
  'acct_money_path',
  'ch_money_path',
  'order_63000000-0000-4000-8000-000000000001',
  'transfer:63000000-0000-4000-8000-000000000001',
  'tr_money_path',
  now() - interval '8 days'
);

DO $$
DECLARE
  v_journal_id uuid;
  v_pending uuid;
  v_connected uuid;
BEGIN
  INSERT INTO public.ledger_transactions (
    transaction_id,
    journal_type,
    idempotency_key,
    business_reference,
    stripe_transfer_id
  )
  VALUES (
    '63000000-0000-4000-8000-000000000001',
    'transfer_to_connect',
    'seed-transfer:tr_money_path',
    'seed-transfer:tr_money_path',
    'tr_money_path'
  )
  RETURNING id INTO v_journal_id;

  v_pending := private.get_or_create_ledger_account(
    'seller_pending',
    '61000000-0000-4000-8000-000000000002',
    '63000000-0000-4000-8000-000000000001',
    'EUR'
  );
  v_connected := private.get_or_create_ledger_account(
    'seller_connected',
    '61000000-0000-4000-8000-000000000002',
    '63000000-0000-4000-8000-000000000001',
    'EUR'
  );

  INSERT INTO public.ledger_entries (
    ledger_transaction_id,
    account_id,
    amount_minor
  )
  VALUES
    (v_journal_id, v_pending, -10500),
    (v_journal_id, v_connected, 10500);

  PERFORM private.rebuild_wallet_projection(
    '61000000-0000-4000-8000-000000000002'
  );
END $$;

SELECT ok(
  public.apply_stripe_transfer_reversal('tr_money_path', 4000),
  'partial Connect reversal is accepted'
);
SELECT is(
  (
    SELECT status::text
    FROM public.seller_transfers
    WHERE stripe_transfer_id = 'tr_money_path'
  ),
  'transferred',
  'partial reversal keeps residual funds payoutable'
);
SELECT is(
  (
    SELECT amount_reversed_minor
    FROM public.seller_transfers
    WHERE stripe_transfer_id = 'tr_money_path'
  ),
  4000::bigint,
  'partial reversal amount is persisted'
);

-- payout_pending: refund must debt immediately, not queue reverse.
INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '62000000-0000-4000-8000-000000000002',
  '61000000-0000-4000-8000-000000000002',
  'Money path card 2',
  50,
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
  stripe_charge_id,
  stripe_payment_intent_id
)
VALUES (
  '63000000-0000-4000-8000-000000000002',
  '62000000-0000-4000-8000-000000000002',
  '61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  56,
  3.5,
  2.5,
  'COMPLETED',
  'ch_money_path_2',
  'pi_money_path_2'
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
  stripe_transfer_id,
  transferred_at,
  payout_reserved_minor
)
VALUES (
  '63000000-0000-4000-8000-000000000002',
  '61000000-0000-4000-8000-000000000002',
  5250,
  'EUR',
  'payout_pending',
  'acct_money_path',
  'ch_money_path_2',
  'order_63000000-0000-4000-8000-000000000002',
  'transfer:63000000-0000-4000-8000-000000000002',
  'tr_money_path_2',
  now() - interval '8 days',
  5250
);

SELECT lives_ok(
  $$ SELECT * FROM public.apply_stripe_refund('ch_money_path_2', 1000, 're_money_path_2') $$,
  'payout_pending refund is accepted'
);
SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.financial_recoveries
    WHERE transaction_id = '63000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'payout_pending refund does not queue a Connect reverse'
);
SELECT ok(
  (
    SELECT COALESCE(debt_minor, 0) > 0
    FROM public.seller_risk_accounts
    WHERE seller_id = '61000000-0000-4000-8000-000000000002'
  ),
  'payout_pending refund records seller debt immediately'
);

-- Fresh transferred order for recovery lease + abandon coverage.
INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '62000000-0000-4000-8000-000000000003',
  '61000000-0000-4000-8000-000000000002',
  'Money path card 3',
  80,
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
  stripe_charge_id,
  stripe_payment_intent_id
)
VALUES (
  '63000000-0000-4000-8000-000000000003',
  '62000000-0000-4000-8000-000000000003',
  '61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  90,
  5.5,
  4.5,
  'COMPLETED',
  'ch_money_path_3',
  'pi_money_path_3'
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
  stripe_transfer_id,
  transferred_at
)
VALUES (
  '63000000-0000-4000-8000-000000000003',
  '61000000-0000-4000-8000-000000000002',
  8450,
  'EUR',
  'transferred',
  'acct_money_path',
  'ch_money_path_3',
  'order_63000000-0000-4000-8000-000000000003',
  'transfer:63000000-0000-4000-8000-000000000003',
  'tr_money_path_3',
  now() - interval '8 days'
);

DO $$
DECLARE
  v_journal_id uuid;
  v_pending uuid;
  v_connected uuid;
BEGIN
  INSERT INTO public.ledger_transactions (
    transaction_id,
    journal_type,
    idempotency_key,
    business_reference,
    stripe_transfer_id
  )
  VALUES (
    '63000000-0000-4000-8000-000000000003',
    'transfer_to_connect',
    'seed-transfer:tr_money_path_3',
    'seed-transfer:tr_money_path_3',
    'tr_money_path_3'
  )
  RETURNING id INTO v_journal_id;

  v_pending := private.get_or_create_ledger_account(
    'seller_pending',
    '61000000-0000-4000-8000-000000000002',
    '63000000-0000-4000-8000-000000000003',
    'EUR'
  );
  v_connected := private.get_or_create_ledger_account(
    'seller_connected',
    '61000000-0000-4000-8000-000000000002',
    '63000000-0000-4000-8000-000000000003',
    'EUR'
  );

  INSERT INTO public.ledger_entries (
    ledger_transaction_id,
    account_id,
    amount_minor
  )
  VALUES
    (v_journal_id, v_pending, -8450),
    (v_journal_id, v_connected, 8450);
END $$;

SELECT lives_ok(
  $$ SELECT * FROM public.apply_stripe_refund('ch_money_path_3', 2000, 're_money_path_3') $$,
  'transferred refund queues a durable recovery'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.prepare_financial_recovery(
      (
        SELECT id
        FROM public.financial_recoveries
        WHERE transaction_id = '63000000-0000-4000-8000-000000000003'
      )
    )
  ),
  1,
  'first prepare acquires the recovery lease'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.prepare_financial_recovery(
      (
        SELECT id
        FROM public.financial_recoveries
        WHERE transaction_id = '63000000-0000-4000-8000-000000000003'
      )
    )
  ),
  0,
  'second prepare is rejected while the lease is held'
);

SELECT ok(
  public.abandon_financial_recovery(
    (
      SELECT id
      FROM public.financial_recoveries
      WHERE transaction_id = '63000000-0000-4000-8000-000000000003'
    ),
    'stripe insufficient_funds'
  ),
  'terminal reverse failure abandons into seller debt'
);

SELECT ok(
  (
    SELECT payouts_blocked
    FROM public.seller_risk_accounts
    WHERE seller_id = '61000000-0000-4000-8000-000000000002'
  ),
  'abandoned recovery blocks seller payouts via risk account'
);

SELECT is(
  (
    SELECT status::text
    FROM public.financial_recoveries
    WHERE transaction_id = '63000000-0000-4000-8000-000000000003'
  ),
  'canceled',
  'abandoned recovery is marked canceled'
);

SELECT * FROM finish();
ROLLBACK;
