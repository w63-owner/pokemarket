BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(15);

-- Seller has a completed Connect transfer, then a partial bank payout that
-- leaves residual funds on Connect (the default 10% dispute reserve path).
-- A later full refund must debt only the paid-out portion and queue a
-- Connect reverse for the residual — not debt the entire liability.

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '61000000-0000-4000-8000-000000000001',
    'residual-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"residual_buyer"}'::jsonb
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    'residual-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"residual_seller"}'::jsonb
  );

UPDATE public.profiles
SET stripe_account_id = 'acct_residual'
WHERE id = '61000000-0000-4000-8000-000000000002';

UPDATE public.financial_payout_config
SET minimum_payout_minor = 100,
    risk_reserve_minor = 0,
    dispute_reserve_bps = 1000,
    payout_delay_days = 0
WHERE singleton;

INSERT INTO public.listings (id, seller_id, title, price_seller, status)
VALUES (
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  'Residual reverse card',
  100,
  'LOCKED'
);

INSERT INTO public.transactions (
  id, listing_id, buyer_id, seller_id,
  total_amount, fee_amount, shipping_cost, status
)
VALUES (
  '63000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  100, 0, 0, 'PENDING_PAYMENT'
);

SELECT is(
  public.finalize_paid_transaction(
    '63000000-0000-4000-8000-000000000001',
    'pi_residual',
    'ch_residual'
  ),
  'PAID',
  'residual: payment finalized'
);

UPDATE public.transactions
SET status = 'SHIPPED', shipped_at = now()
WHERE id = '63000000-0000-4000-8000-000000000001';

SELECT ok(
  public.release_escrow_funds(
    '63000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001'
  ),
  'residual: escrow released'
);

SELECT is(
  (SELECT status::text FROM public.prepare_seller_transfer(
    '63000000-0000-4000-8000-000000000001'
  )),
  'processing',
  'residual: transfer prepared'
);

SELECT ok(
  public.record_seller_transfer_success(
    '63000000-0000-4000-8000-000000000001',
    'tr_residual',
    'ch_residual',
    'order_63000000-0000-4000-8000-000000000001'
  ),
  'residual: transfer recorded'
);

-- 10% proportional reserve → payout 9000 of 10000.
SELECT is(
  (SELECT amount_minor FROM public.reserve_seller_payout(
    '61000000-0000-4000-8000-000000000002'
  )),
  9000::bigint,
  'residual: payout reserves 90% leaving 10% on Connect'
);

SELECT ok(
  public.attach_stripe_payout(
    (SELECT id FROM public.payouts
     WHERE user_id = '61000000-0000-4000-8000-000000000002'
     ORDER BY requested_at DESC LIMIT 1),
    'po_residual',
    'acct_residual'
  ),
  'residual: Stripe payout attached'
);

SELECT ok(
  public.apply_stripe_payout_transition('po_residual', 'paid'),
  'residual: payout.paid leaves residual Connect balance'
);

SELECT is(
  (
    SELECT paid_minor
    FROM public.seller_transfers
    WHERE transaction_id = '63000000-0000-4000-8000-000000000001'
  ),
  9000::bigint,
  'residual: paid_minor reflects bank payout'
);

SELECT is(
  (
    SELECT amount_minor - amount_reversed_minor - paid_minor - payout_reserved_minor
    FROM public.seller_transfers
    WHERE transaction_id = '63000000-0000-4000-8000-000000000001'
  ),
  1000::bigint,
  'residual: 1000 remains reversible on Connect'
);

CREATE TEMP TABLE residual_refund_result AS
SELECT *
FROM public.apply_stripe_refund('ch_residual', 10000, 're_residual_full');

SELECT is(
  (SELECT debt_minor FROM residual_refund_result),
  9000::bigint,
  'residual: seller_debt equals paid-out portion only (9000)'
);

SELECT is(
  (SELECT recovery_queued FROM residual_refund_result),
  true,
  'residual: Connect reverse recovery is queued'
);

SELECT is(
  (SELECT applied_minor FROM residual_refund_result),
  9000::bigint,
  'residual: applied_minor matches immediate debt portion'
);

SELECT is(
  (
    SELECT target_amount_minor
    FROM public.financial_recoveries
    WHERE transaction_id = '63000000-0000-4000-8000-000000000001'
      AND kind = 'refund'
  ),
  1000::bigint,
  'residual: Connect reverse recovery targets residual 1000 only'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.financial_outbox
    WHERE event_type = 'transfer_reversal_requested'
      AND aggregate_id = '63000000-0000-4000-8000-000000000001'
      AND status IN ('PENDING', 'PROCESSING', 'FAILED')
  ),
  1,
  'residual: reversal outbox job queued for residual Connect balance'
);

SELECT is(
  (
    SELECT seller_refunded_minor
    FROM public.transactions
    WHERE id = '63000000-0000-4000-8000-000000000001'
  ),
  9000::bigint,
  'residual: seller_refunded_minor records debt now; reverse completes later'
);

SELECT * FROM finish();
ROLLBACK;
