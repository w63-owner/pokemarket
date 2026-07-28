BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(3);

SELECT has_view(
  'public',
  'financial_reconciliation_alerts',
  'financial reconciliation alerts view exists'
);

SELECT columns_are(
  'public',
  'financial_reconciliation_alerts',
  ARRAY[
    'alert_type',
    'entity_id',
    'expected_minor',
    'actual_minor',
    'detected_at',
    'details'
  ]::name[],
  'financial reconciliation alerts expose the reviewed operational contract'
);

SELECT is(
  has_table_privilege(
    'authenticated',
    'public.financial_reconciliation_alerts',
    'SELECT'
  ),
  false,
  'authenticated clients cannot read platform-wide financial alerts'
);

SELECT * FROM finish();
ROLLBACK;
