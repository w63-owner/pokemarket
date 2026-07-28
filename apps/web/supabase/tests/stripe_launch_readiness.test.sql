BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(17);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ledger_accounts'::regclass),
  'ledger accounts enforce RLS'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ledger_transactions'::regclass),
  'ledger transactions enforce RLS'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ledger_entries'::regclass),
  'ledger entries enforce RLS'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.financial_outbox'::regclass),
  'financial outbox enforces RLS'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.stripe_object_bindings'::regclass),
  'Stripe object bindings enforce RLS'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.seller_transfers'::regclass),
  'seller transfers enforce RLS'
);

SELECT is(
  has_table_privilege('anon', 'public.ledger_entries', 'SELECT'),
  false,
  'anonymous clients cannot read ledger entries'
);
SELECT is(
  has_table_privilege('authenticated', 'public.ledger_entries', 'SELECT'),
  false,
  'authenticated clients cannot read ledger entries'
);
SELECT is(
  has_table_privilege('anon', 'public.financial_outbox', 'SELECT'),
  false,
  'anonymous clients cannot read the financial outbox'
);
SELECT is(
  has_table_privilege('authenticated', 'public.financial_outbox', 'SELECT'),
  false,
  'authenticated clients cannot read the financial outbox'
);
SELECT is(
  has_table_privilege(
    'authenticated',
    'public.financial_reconciliation_alerts',
    'SELECT'
  ),
  false,
  'authenticated clients cannot read platform reconciliation alerts'
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
  'every persisted ledger journal is balanced'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.ledger_transactions
    WHERE transaction_id IS NOT NULL
      AND business_reference = ''
  ),
  0::bigint,
  'financial journals keep a non-empty business reference'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.seller_transfers
    WHERE stripe_transfer_id IS NOT NULL
      AND source_charge_id IS NULL
  ),
  0::bigint,
  'persisted Stripe transfers retain their source charge'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.seller_transfers
    WHERE status IN ('paid', 'payout_pending')
      AND stripe_transfer_id IS NULL
  ),
  0::bigint,
  'no payout state exists before a Stripe transfer'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.financial_reconciliation_alerts
  ),
  0::bigint,
  'the database reconciliation view reports no launch blocker'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.seller_risk_accounts
    WHERE debt_minor > 0 OR payouts_blocked
  ),
  0::bigint,
  'no seller debt or payout block remains before launch'
);

SELECT * FROM finish();
ROLLBACK;
