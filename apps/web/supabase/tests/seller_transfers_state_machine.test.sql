BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(27);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '41000000-0000-4000-8000-000000000001',
    'sprint4-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"sprint4_buyer"}'::jsonb
  ),
  (
    '41000000-0000-4000-8000-000000000002',
    'sprint4-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"sprint4_seller"}'::jsonb
  );

UPDATE public.profiles
SET stripe_account_id = 'acct_sprint4_seller'
WHERE id = '41000000-0000-4000-8000-000000000002';

UPDATE public.financial_payout_config
SET minimum_payout_minor = 1000,
    risk_reserve_minor = 500,
    dispute_reserve_bps = 0,
    payout_delay_days = 0
WHERE singleton;

INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '42000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000002',
  'Sprint 4 transfer card',
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
  '43000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000002',
  112,
  7,
  5,
  'PENDING_PAYMENT'
);

SELECT is(
  public.finalize_paid_transaction(
    '43000000-0000-4000-8000-000000000001',
    'pi_sprint4',
    'ch_sprint4'
  ),
  'PAID',
  'payment is finalized before release'
);

UPDATE public.transactions
SET status = 'SHIPPED', shipped_at = now()
WHERE id = '43000000-0000-4000-8000-000000000001';

SELECT ok(
  public.release_escrow_funds(
    '43000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001'
  ),
  'escrow release enqueues the transfer'
);
SELECT is(
  (
    SELECT status::text
    FROM public.seller_transfers
    WHERE transaction_id = '43000000-0000-4000-8000-000000000001'
  ),
  'queued',
  'order transfer starts queued'
);
SELECT is(
  (
    SELECT status::text
    FROM public.prepare_seller_transfer(
      '43000000-0000-4000-8000-000000000001'
    )
  ),
  'processing',
  'worker atomically moves the order transfer to processing'
);
SELECT ok(
  public.record_seller_transfer_success(
    '43000000-0000-4000-8000-000000000001',
    'tr_sprint4',
    'ch_sprint4',
    'order_43000000-0000-4000-8000-000000000001'
  ),
  'Stripe transfer success is recorded'
);
SELECT is(
  (
    SELECT status::text
    FROM public.seller_transfers
    WHERE transaction_id = '43000000-0000-4000-8000-000000000001'
  ),
  'transferred',
  'order transfer reaches transferred'
);
SELECT is(
  (
    SELECT stripe_transfer_id
    FROM public.ledger_transactions
    WHERE idempotency_key =
      'transfer:43000000-0000-4000-8000-000000000001'
  ),
  'tr_sprint4',
  'immutable financial movement stores the Stripe transfer id'
);
SELECT is(
  (
    SELECT available_balance
    FROM public.wallets
    WHERE user_id = '41000000-0000-4000-8000-000000000002'
  ),
  105::numeric,
  'platform-to-connected transfer preserves seller withdrawable balance'
);

SELECT is(
  (SELECT amount_minor FROM public.reserve_seller_payout(
    '41000000-0000-4000-8000-000000000002'
  )),
  10000::bigint,
  'payout reservation enforces the configured risk reserve'
);
SELECT is(
  (
    SELECT available_balance
    FROM public.wallets
    WHERE user_id = '41000000-0000-4000-8000-000000000002'
  ),
  5::numeric,
  'wallet decreases only after a durable payout reservation exists'
);
SELECT ok(
  public.fail_reserved_payout(
    (SELECT id FROM public.payouts ORDER BY requested_at DESC LIMIT 1),
    'bank_account_invalid',
    'test failure'
  ),
  'explicit payout failure is applied atomically'
);
SELECT is(
  (
    SELECT available_balance
    FROM public.wallets
    WHERE user_id = '41000000-0000-4000-8000-000000000002'
  ),
  105::numeric,
  'failed payout restores connected funds exactly once'
);

SELECT is(
  (SELECT amount_minor FROM public.reserve_seller_payout(
    '41000000-0000-4000-8000-000000000002'
  )),
  10000::bigint,
  'restored funds can be reserved by a new payout attempt'
);
SELECT ok(
  public.attach_stripe_payout(
    (SELECT id FROM public.payouts WHERE status = 'pending' LIMIT 1),
    'po_sprint4',
    'acct_sprint4_seller'
  ),
  'Stripe payout id is attached to the durable attempt'
);
SELECT ok(
  public.apply_stripe_payout_transition('po_sprint4', 'paid'),
  'payout.paid consumes the reserved balance'
);
SELECT ok(
  public.apply_stripe_payout_transition(
    'po_sprint4',
    'failed',
    'late_event',
    'out of order'
  ),
  'late failed event is safely ignored after paid'
);
SELECT is(
  (
    SELECT available_balance
    FROM public.wallets
    WHERE user_id = '41000000-0000-4000-8000-000000000002'
  ),
  5::numeric,
  'out-of-order terminal event does not restore paid funds'
);

SELECT ok(
  public.apply_stripe_transfer_reversal('tr_sprint4', 10500),
  'transfer.reversed is persisted'
);
SELECT is(
  (
    SELECT status::text
    FROM public.seller_transfers
    WHERE stripe_transfer_id = 'tr_sprint4'
  ),
  'reversed',
  'order transfer reaches reversed'
);

-- Reversal while a payout is in payout_pending status.
-- Set up a second complete order for a fresh payout cycle.
INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '42000000-0000-4000-8000-000000000002',
  '41000000-0000-4000-8000-000000000002',
  'Sprint 4b card',
  80,
  'LOCKED'
);
INSERT INTO public.transactions (
  id, listing_id, buyer_id, seller_id,
  total_amount, fee_amount, shipping_cost, status
)
VALUES (
  '43000000-0000-4000-8000-000000000002',
  '42000000-0000-4000-8000-000000000002',
  '41000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000002',
  80, 5, 0, 'PENDING_PAYMENT'
);
SELECT is(
  public.finalize_paid_transaction(
    '43000000-0000-4000-8000-000000000002', 'pi_sprint4b', 'ch_sprint4b'
  ),
  'PAID',
  'second order payment is finalized'
);
UPDATE public.transactions
SET status = 'SHIPPED', shipped_at = now()
WHERE id = '43000000-0000-4000-8000-000000000002';
SELECT ok(
  public.release_escrow_funds(
    '43000000-0000-4000-8000-000000000002',
    '41000000-0000-4000-8000-000000000001'
  ),
  'second order escrow is released'
);
SELECT is(
  (SELECT status::text FROM public.prepare_seller_transfer(
    '43000000-0000-4000-8000-000000000002'
  )),
  'processing',
  'second transfer moves to processing'
);
SELECT ok(
  public.record_seller_transfer_success(
    '43000000-0000-4000-8000-000000000002',
    'tr_sprint4b', 'ch_sprint4b',
    'order_43000000-0000-4000-8000-000000000002'
  ),
  'second transfer recorded'
);
-- Reserve a payout for the second order — status becomes payout_pending.
SELECT is(
  (SELECT amount_minor FROM public.reserve_seller_payout(
    '41000000-0000-4000-8000-000000000002'
  )),
  7500::bigint,
  'second payout reservation honours the risk reserve'
);
-- While the payout is payout_pending, a reversal arrives for the second transfer.
SELECT ok(
  public.apply_stripe_transfer_reversal('tr_sprint4b', 7500),
  'reversal during payout_pending is persisted'
);
SELECT is(
  (SELECT status::text FROM public.seller_transfers
   WHERE stripe_transfer_id = 'tr_sprint4b'),
  'reversed',
  'transfer moves to reversed even during payout_pending'
);

-- Late payout.canceled arriving after the payout was already paid must be ignored.
SELECT ok(
  public.apply_stripe_payout_transition('po_sprint4', 'canceled', 'late_cancel', 'arrived too late'),
  'late payout.canceled after paid is safely ignored'
);
SELECT is(
  (SELECT status::text FROM public.payouts WHERE stripe_payout_id = 'po_sprint4'),
  'paid',
  'payout status stays paid after late cancel event'
);
SELECT is(
  (SELECT available_balance FROM public.wallets
   WHERE user_id = '41000000-0000-4000-8000-000000000002'),
  5::numeric,
  'wallet is not restored after late cancel on already-paid payout'
);

-- Expired processing lease recovery.
UPDATE public.seller_transfers
SET processing_started_at = now() - interval '20 minutes'
WHERE transaction_id = '43000000-0000-4000-8000-000000000001'
  AND status = 'reversed';
-- This row is reversed, not processing, so it should not be touched.
SELECT is(
  public.recover_stale_processing_transfers(600),
  0,
  'recover_stale_processing_transfers returns 0 when no processing transfers are stale'
);

-- Force a row into processing with an old started_at to test the recovery.
INSERT INTO public.transactions (
  id, listing_id, buyer_id, seller_id,
  total_amount, fee_amount, shipping_cost, status
)
VALUES (
  '43000000-0000-4000-8000-000000000003',
  '42000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000002',
  50, 5, 0, 'COMPLETED'
);
INSERT INTO public.seller_transfers (
  transaction_id, seller_id, amount_minor, currency,
  status, processing_started_at
)
VALUES (
  '43000000-0000-4000-8000-000000000003',
  '41000000-0000-4000-8000-000000000002',
  4500, 'EUR',
  'processing',
  now() - interval '15 minutes'
);
SELECT is(
  public.recover_stale_processing_transfers(600),
  1,
  'recover_stale_processing_transfers resets one stale processing transfer'
);
SELECT is(
  (SELECT status::text FROM public.seller_transfers
   WHERE transaction_id = '43000000-0000-4000-8000-000000000003'),
  'queued',
  'recovered transfer is back in queued ready for retry'
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
  'all Sprint 4 journals remain balanced'
);

SELECT * FROM finish();
ROLLBACK;
