BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(3);

INSERT INTO public.tcgdex_series (language, id, name)
VALUES ('fr', 'snapshot-series', 'Série snapshots');

INSERT INTO public.tcgdex_sets (
  language,
  id,
  name,
  series_id,
  card_count
)
VALUES (
  'fr',
  'snapshot-set',
  'Extension snapshots',
  'snapshot-series',
  '{"official": 100}'::jsonb
);

INSERT INTO public.tcgdex_cards (
  language,
  id,
  name,
  set_id,
  local_id
)
VALUES (
  'fr',
  'snapshot-card',
  'Carte snapshots',
  'snapshot-set',
  '1'
);

INSERT INTO public.card_price_collection_runs (
  source,
  language,
  snapshot_date,
  status,
  total_cards,
  processed_cards,
  priced_cards,
  completed_at
)
VALUES (
  'CARDMARKET_TCGDEX',
  'fr',
  '2026-08-20',
  'completed',
  1,
  1,
  1,
  now()
);

INSERT INTO public.card_price_history (
  card_key,
  price,
  condition,
  language,
  is_graded,
  source,
  variant,
  currency,
  snapshot_date
)
VALUES
  (
    'fr-snapshot-card',
    50,
    'UNSPECIFIED',
    'fr',
    FALSE,
    'CARDMARKET_TCGDEX',
    'normal',
    'EUR',
    '2026-08-20'
  ),
  (
    'fr-snapshot-card',
    75,
    'UNSPECIFIED',
    'fr',
    FALSE,
    'CARDMARKET_TCGDEX',
    'holo',
    'EUR',
    '2026-08-20'
  )
ON CONFLICT (card_key, variant, source, snapshot_date)
DO UPDATE SET price = EXCLUDED.price;

INSERT INTO public.card_price_history (
  card_key,
  price,
  condition,
  language,
  is_graded,
  source,
  variant,
  currency,
  snapshot_date
)
VALUES (
  'fr-snapshot-card',
  55,
  'UNSPECIFIED',
  'fr',
  FALSE,
  'CARDMARKET_TCGDEX',
  'normal',
  'EUR',
  '2026-08-20'
)
ON CONFLICT (card_key, variant, source, snapshot_date)
DO UPDATE SET price = EXCLUDED.price;

SELECT is(
  (
    SELECT count(*)
    FROM public.card_price_history
    WHERE card_key = 'fr-snapshot-card'
      AND snapshot_date = '2026-08-20'
  ),
  2::bigint,
  'repeated daily collection keeps one row per variant'
);

SELECT results_eq(
  $$
    SELECT card_key, variant, price
    FROM public.get_current_cardmarket_top('fr', 10)
    WHERE card_key = 'fr-snapshot-card'
  $$,
  $$
    VALUES ('fr-snapshot-card'::text, 'holo'::text, 75::numeric)
  $$,
  'the ranking RPC keeps only the most valuable variant per card'
);

INSERT INTO public.card_price_collection_runs (
  source,
  language,
  snapshot_date,
  status,
  total_cards,
  processed_cards,
  priced_cards
)
VALUES (
  'CARDMARKET_TCGDEX',
  'fr',
  '2026-08-21',
  'partial',
  10,
  1,
  1
);

INSERT INTO public.card_price_history (
  card_key,
  price,
  condition,
  language,
  is_graded,
  source,
  variant,
  currency,
  snapshot_date
)
VALUES (
  'fr-snapshot-card',
  999,
  'UNSPECIFIED',
  'fr',
  FALSE,
  'CARDMARKET_TCGDEX',
  'normal',
  'EUR',
  '2026-08-21'
);

SELECT is(
  (
    SELECT price
    FROM public.get_current_cardmarket_top('fr', 10)
    WHERE card_key = 'fr-snapshot-card'
  ),
  75::numeric,
  'the ranking ignores incomplete collection days'
);

SELECT * FROM finish();
ROLLBACK;
