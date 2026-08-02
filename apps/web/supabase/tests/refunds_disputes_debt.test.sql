BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(27);

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

INSERT INTO public.seller_transfers (
  transaction_id,
  seller_id,
  amount_minor,
  currency,
  stripe_account_id,
  source_charge_id,
  transfer_group,
  idempotency_key
)
VALUES (
  '53000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000002',
  10500,
  'EUR',
  'acct_sprint5',
  'ch_sprint5',
  'order_53000000-0000-4000-8000-000000000001',
  'transfer:53000000-0000-4000-8000-000000000001'
);

INSERT INTO public.financial_outbox (
  event_type,
  aggregate_id,
  idempotency_key,
  payload
)
VALUES (
  'transfer_requested',
  '53000000-0000-4000-8000-000000000001',
  'transfer-requested:53000000-0000-4000-8000-000000000001',
  '{"transaction_id":"53000000-0000-4000-8000-000000000001"}'::jsonb
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
SELECT is(
  (
    SELECT cancellation_requested_at
    FROM public.seller_transfers
    WHERE transaction_id = '53000000-0000-4000-8000-000000000001'
  ),
  NULL::timestamptz,
  'partial refund before Stripe execution keeps the queued seller transfer'
);
SELECT is(
  (
    SELECT amount_minor
    FROM public.seller_transfers
    WHERE transaction_id = '53000000-0000-4000-8000-000000000001'
  ),
  10000::bigint,
  'queued transfer is resized to the residual seller balance'
);
SELECT is(
  (
    SELECT status
    FROM public.financial_outbox
    WHERE idempotency_key =
      'transfer-requested:53000000-0000-4000-8000-000000000001'
  ),
  'PENDING',
  'resized transfer job remains reclaimable by the worker'
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

-- ─────────────────────────────────────────────────────────────────
-- Debt lifecycle: debt after payout, PAYOUT_BLOCKED, future-credit
-- ─────────────────────────────────────────────────────────────────
-- Set up a fresh seller whose payout cycle has already completed.
INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES (
  '51000000-0000-4000-8000-000000000003',
  'sprint5-debt-seller@example.test',
  'authenticated',
  'authenticated',
  '{"username":"sprint5_debt_seller"}'::jsonb
);
UPDATE public.profiles
SET stripe_account_id = 'acct_sprint5_debt'
WHERE id = '51000000-0000-4000-8000-000000000003';

UPDATE public.financial_payout_config
SET minimum_payout_minor = 100,
    risk_reserve_minor = 0,
    dispute_reserve_bps = 0,
    payout_delay_days = 0
WHERE singleton;

INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '52000000-0000-4000-8000-000000000002',
  '51000000-0000-4000-8000-000000000003',
  'Debt cycle card',
  50,
  'LOCKED'
);
INSERT INTO public.transactions (
  id, listing_id, buyer_id, seller_id,
  total_amount, fee_amount, shipping_cost, status
)
VALUES (
  '53000000-0000-4000-8000-000000000002',
  '52000000-0000-4000-8000-000000000002',
  '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000003',
  50, 5, 0, 'PENDING_PAYMENT'
);
-- Finalize, release escrow, transfer.
SELECT is(
  public.finalize_paid_transaction(
    '53000000-0000-4000-8000-000000000002', 'pi_debt', 'ch_debt'
  ),
  'PAID',
  'debt-cycle: payment finalized'
);
UPDATE public.transactions
SET status = 'SHIPPED', shipped_at = now()
WHERE id = '53000000-0000-4000-8000-000000000002';
SELECT ok(
  public.release_escrow_funds(
    '53000000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000001'
  ),
  'debt-cycle: escrow released'
);
SELECT is(
  (SELECT status::text FROM public.prepare_seller_transfer(
    '53000000-0000-4000-8000-000000000002'
  )),
  'processing',
  'debt-cycle: transfer moves to processing'
);
SELECT ok(
  public.record_seller_transfer_success(
    '53000000-0000-4000-8000-000000000002',
    'tr_debt', 'ch_debt', 'order_53000000-0000-4000-8000-000000000002'
  ),
  'debt-cycle: transfer recorded'
);
-- Reserve and pay out all available funds (no reserve).
SELECT is(
  (SELECT amount_minor FROM public.reserve_seller_payout(
    '51000000-0000-4000-8000-000000000003'
  )),
  4500::bigint,
  'debt-cycle: full payout reserved (no reserve)'
);
SELECT ok(
  public.attach_stripe_payout(
    (SELECT id FROM public.payouts
     WHERE user_id = '51000000-0000-4000-8000-000000000003'
     ORDER BY requested_at DESC LIMIT 1),
    'po_debt',
    'acct_sprint5_debt'
  ),
  'debt-cycle: Stripe payout attached'
);
SELECT ok(
  public.apply_stripe_payout_transition('po_debt', 'paid'),
  'debt-cycle: payout.paid consumes all seller funds'
);
SELECT is(
  (SELECT available_balance FROM public.wallets
   WHERE user_id = '51000000-0000-4000-8000-000000000003'),
  0::numeric,
  'debt-cycle: seller available balance is 0 after full payout'
);
-- A dispute is now lost, creating seller debt.
INSERT INTO public.stripe_disputes (
  stripe_dispute_id, stripe_charge_id, transaction_id,
  amount, amount_minor, currency, status, reason
)
VALUES (
  'dp_debt', 'ch_debt', '53000000-0000-4000-8000-000000000002',
  45, 4500, 'EUR', 'needs_response', 'fraudulent'
);
SELECT ok(
  public.lock_stripe_dispute('dp_debt'),
  'debt-cycle: dispute locked (seller has no remaining balance)'
);
SELECT ok(
  public.resolve_stripe_dispute('dp_debt', 'lost'),
  'debt-cycle: lost dispute creates seller debt'
);
-- Seller now has debt → payouts must be blocked.
SELECT throws_ok(
  $$SELECT * FROM public.reserve_seller_payout(
      '51000000-0000-4000-8000-000000000003'::uuid)$$,
  'P0001',
  NULL,
  'PAYOUT_BLOCKED_BY_SELLER_DEBT raised when seller has outstanding debt'
);
-- A new order comes in; the credit should auto-consume the debt.
INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '52000000-0000-4000-8000-000000000003',
  '51000000-0000-4000-8000-000000000003',
  'Recovery card',
  60,
  'LOCKED'
);
INSERT INTO public.transactions (
  id, listing_id, buyer_id, seller_id,
  total_amount, fee_amount, shipping_cost, status
)
VALUES (
  '53000000-0000-4000-8000-000000000003',
  '52000000-0000-4000-8000-000000000003',
  '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000003',
  60, 5, 0, 'PENDING_PAYMENT'
);
-- finalize_paid_transaction triggers consume_seller_debt_from_credit.
SELECT is(
  public.finalize_paid_transaction(
    '53000000-0000-4000-8000-000000000003', 'pi_recovery', 'ch_recovery'
  ),
  'PAID',
  'debt-cycle: new payment finalizes and triggers debt recovery'
);
SELECT is(
  (
    SELECT debt_minor
    FROM public.seller_risk_accounts
    WHERE seller_id = '51000000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'debt is fully consumed by the new credit'
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
  'all Sprint 5 debt-cycle journals remain balanced'
);

SELECT * FROM finish();
ROLLBACK;
