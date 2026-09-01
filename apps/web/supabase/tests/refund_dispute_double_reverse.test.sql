BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '61000000-0000-4000-8000-000000000001',
    'ddr-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"ddr_buyer"}'::jsonb
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    'ddr-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"ddr_seller"}'::jsonb
  );

UPDATE public.profiles
SET stripe_account_id = 'acct_ddr'
WHERE id = '61000000-0000-4000-8000-000000000002';

INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  'Double reverse card',
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
  100,
  10,
  0,
  'PENDING_PAYMENT'
);

SELECT is(
  public.finalize_paid_transaction(
    '63000000-0000-4000-8000-000000000001',
    'pi_ddr',
    'ch_ddr'
  ),
  'PAID',
  'order is paid'
);

UPDATE public.transactions
SET status = 'SHIPPED', shipped_at = now()
WHERE id = '63000000-0000-4000-8000-000000000001';

SELECT ok(
  public.release_escrow_funds(
    '63000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001'
  ),
  'escrow released to available / transfer path'
);

-- Simulate a completed Connect transfer + completed dispute reverse that
-- parked seller liability in seller_locked (locked_minor > consumed_minor).
UPDATE public.seller_transfers
SET stripe_transfer_id = 'tr_ddr',
    status = 'reversed',
    amount_reversed_minor = amount_minor,
    reversed_at = now()
WHERE transaction_id = '63000000-0000-4000-8000-000000000001';

INSERT INTO public.stripe_disputes (
  stripe_dispute_id,
  stripe_charge_id,
  transaction_id,
  amount,
  amount_minor,
  currency,
  status,
  reason,
  seller_liability_minor,
  locked_minor,
  consumed_minor
)
VALUES (
  'dp_ddr',
  'ch_ddr',
  '63000000-0000-4000-8000-000000000001',
  100,
  10000,
  'EUR',
  'needs_response',
  'product_not_received',
  9000,
  9000,
  0
);

-- Mirror the ledger effect of apply_stripe_transfer_reversal: funds sit in
-- seller_locked for this order.
DO $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_journal uuid;
  v_locked uuid;
BEGIN
  SELECT * INTO STRICT v_tx
  FROM public.transactions
  WHERE id = '63000000-0000-4000-8000-000000000001';

  INSERT INTO public.ledger_transactions (
    transaction_id,
    journal_type,
    idempotency_key,
    business_reference
  )
  VALUES (
    v_tx.id,
    'transfer_reversed',
    'test-ddr-lock',
    'test-ddr-lock'
  )
  RETURNING id INTO v_journal;

  v_locked := private.get_or_create_ledger_account(
    'seller_locked', v_tx.seller_id, v_tx.id, 'EUR'
  );

  INSERT INTO public.ledger_entries (
    ledger_transaction_id, account_id, amount_minor
  )
  VALUES (v_journal, v_locked, 9000);

  PERFORM private.rebuild_wallet_projection(v_tx.seller_id);
END $$;

SELECT lives_ok(
  $$ SELECT * FROM public.apply_stripe_refund('ch_ddr', 10000, 're_ddr') $$,
  'full refund after completed dispute lock applies without error'
);

SELECT is(
  (
    SELECT recovery_queued
    FROM public.apply_stripe_refund('ch_ddr', 10000, 're_ddr_replay')
  ),
  false,
  'refund covered by dispute lock does not queue another Connect reverse'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.financial_recoveries
    WHERE transaction_id = '63000000-0000-4000-8000-000000000001'
      AND kind = 'refund'
      AND status IN ('queued', 'processing')
  ),
  0,
  'no active refund recovery job is left queued'
);

SELECT is(
  (
    SELECT consumed_minor
    FROM public.stripe_disputes
    WHERE stripe_dispute_id = 'dp_ddr'
  ),
  9000::bigint,
  'dispute lock is consumed toward the refund'
);

SELECT is(
  (
    SELECT seller_refunded_minor
    FROM public.transactions
    WHERE id = '63000000-0000-4000-8000-000000000001'
  ),
  9000::bigint,
  'seller refunded minor matches the consumed dispute lock'
);

-- ── Dispute won before queued reverse executes ──────────────────────
INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '62000000-0000-4000-8000-000000000002',
  '61000000-0000-4000-8000-000000000002',
  'Won-before-reverse card',
  50,
  'LOCKED'
);

INSERT INTO public.transactions (
  id, listing_id, buyer_id, seller_id,
  total_amount, fee_amount, shipping_cost, status
)
VALUES (
  '63000000-0000-4000-8000-000000000002',
  '62000000-0000-4000-8000-000000000002',
  '61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  50, 5, 0, 'PENDING_PAYMENT'
);

SELECT is(
  public.finalize_paid_transaction(
    '63000000-0000-4000-8000-000000000002',
    'pi_ddr_won',
    'ch_ddr_won'
  ),
  'PAID',
  'second order paid'
);

UPDATE public.transactions
SET status = 'SHIPPED', shipped_at = now()
WHERE id = '63000000-0000-4000-8000-000000000002';

SELECT ok(
  public.release_escrow_funds(
    '63000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000001'
  ),
  'second order escrow released'
);

UPDATE public.seller_transfers
SET stripe_transfer_id = 'tr_ddr_won',
    status = 'transferred'
WHERE transaction_id = '63000000-0000-4000-8000-000000000002';

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
  'dp_ddr_won',
  'ch_ddr_won',
  '63000000-0000-4000-8000-000000000002',
  50,
  5000,
  'EUR',
  'needs_response',
  'fraudulent'
);

SELECT ok(
  public.lock_stripe_dispute('dp_ddr_won'),
  'dispute queues a Connect reverse while transfer is live'
);

SELECT is(
  (
    SELECT status
    FROM public.financial_recoveries
    WHERE stripe_dispute_id = 'dp_ddr_won'
      AND kind = 'dispute'
  ),
  'queued',
  'dispute recovery starts queued'
);

UPDATE public.stripe_disputes
SET status = 'won',
    outcome = 'won'
WHERE stripe_dispute_id = 'dp_ddr_won';

SELECT ok(
  public.resolve_stripe_dispute('dp_ddr_won', 'won'),
  'seller-won dispute resolves'
);

SELECT is(
  (
    SELECT status
    FROM public.financial_recoveries
    WHERE stripe_dispute_id = 'dp_ddr_won'
      AND kind = 'dispute'
  ),
  'canceled',
  'queued dispute reverse is canceled after seller win'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.prepare_financial_recovery(
      (
        SELECT id
        FROM public.financial_recoveries
        WHERE stripe_dispute_id = 'dp_ddr_won'
          AND kind = 'dispute'
      )
    )
  ),
  0,
  'prepare refuses to execute a canceled / won dispute reverse'
);

SELECT * FROM finish();
ROLLBACK;
