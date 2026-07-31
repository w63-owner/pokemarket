-- Sprint 6: read-only reconciliation signals for financial operations.
--
-- The view intentionally remains inaccessible to anon/authenticated. It is
-- consumed only by the server-side admin client (service role) and the
-- authenticated cron route. security_invoker prevents the view owner from
-- becoming an accidental RLS bypass.

CREATE OR REPLACE VIEW public.financial_reconciliation_alerts
WITH (security_invoker = true)
AS
WITH ledger_totals AS (
  SELECT
    e.ledger_transaction_id,
    sum(e.amount_minor)::bigint AS balance_minor
  FROM public.ledger_entries e
  GROUP BY e.ledger_transaction_id
),
connected_transfer_totals AS (
  SELECT
    lt.stripe_transfer_id,
    COALESCE(sum(e.amount_minor) FILTER (
      WHERE a.account_type = 'seller_connected'
    ), 0)::bigint AS connected_minor
  FROM public.ledger_transactions lt
  JOIN public.ledger_entries e ON e.ledger_transaction_id = lt.id
  JOIN public.ledger_accounts a ON a.id = e.account_id
  WHERE lt.journal_type = 'transfer_to_connect'
    AND lt.stripe_transfer_id IS NOT NULL
  GROUP BY lt.stripe_transfer_id
)
SELECT
  'unbalanced_ledger'::text AS alert_type,
  lt.ledger_transaction_id AS entity_id,
  0::bigint AS expected_minor,
  lt.balance_minor AS actual_minor,
  now() AS detected_at,
  '{}'::jsonb AS details
FROM ledger_totals lt
WHERE lt.balance_minor <> 0

UNION ALL

SELECT
  'payment_missing_ledger'::text,
  t.id,
  round(t.total_amount * 100)::bigint,
  0::bigint,
  now(),
  jsonb_build_object(
    'status', t.status,
    'stripe_payment_intent_id', t.stripe_payment_intent_id,
    'stripe_charge_id', t.stripe_charge_id
  )
FROM public.transactions t
WHERE t.status IN ('PAID', 'SHIPPED', 'COMPLETED', 'REFUNDED')
  AND NOT EXISTS (
    SELECT 1
    FROM public.ledger_transactions lt
    WHERE lt.transaction_id = t.id
      AND lt.journal_type = 'payment_captured'
  )

UNION ALL

SELECT
  'transfer_ledger_mismatch'::text,
  st.id,
  st.amount_minor,
  COALESCE(ct.connected_minor, 0),
  now(),
  jsonb_build_object(
    'transaction_id', st.transaction_id,
    'stripe_transfer_id', st.stripe_transfer_id,
    'status', st.status
  )
FROM public.seller_transfers st
LEFT JOIN connected_transfer_totals ct
  ON ct.stripe_transfer_id = st.stripe_transfer_id
WHERE st.status IN ('transferred', 'payout_pending', 'paid')
  AND (
    st.stripe_transfer_id IS NULL
    OR COALESCE(ct.connected_minor, 0) <> st.amount_minor
  )

UNION ALL

SELECT
  'paid_payout_missing_ledger'::text,
  p.id,
  p.amount_minor,
  0::bigint,
  now(),
  jsonb_build_object(
    'stripe_payout_id', p.stripe_payout_id,
    'user_id', p.user_id
  )
FROM public.payouts p
WHERE p.status = 'paid'
  AND (
    p.stripe_payout_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.ledger_transactions lt
      WHERE lt.stripe_payout_id = p.stripe_payout_id
        AND lt.journal_type = 'payout_paid'
    )
  );

REVOKE ALL ON public.financial_reconciliation_alerts
  FROM PUBLIC, anon, authenticated;;
