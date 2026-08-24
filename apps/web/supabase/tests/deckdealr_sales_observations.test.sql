BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(8);

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (
    '61000000-0000-4000-8000-000000000001',
    'sales-observation-buyer@example.test',
    'authenticated',
    'authenticated',
    '{"username":"sales_observation_buyer"}'::jsonb
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    'sales-observation-seller@example.test',
    'authenticated',
    'authenticated',
    '{"username":"sales_observation_seller"}'::jsonb
  );

INSERT INTO public.tcgdex_cards (language, id, name)
VALUES ('fr', 'sales-observation-1', 'Carte observation');

INSERT INTO public.listings (
  id,
  seller_id,
  title,
  price_seller,
  status,
  card_ref_id,
  card_language,
  card_variant,
  condition,
  is_graded
)
VALUES (
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  'Carte observation réelle',
  100,
  'SOLD',
  'fr-sales-observation-1',
  'FR',
  'holo',
  'NEAR_MINT',
  FALSE
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
  107,
  7,
  5,
  'SHIPPED'
);

UPDATE public.transactions
SET status = 'COMPLETED'
WHERE id = '63000000-0000-4000-8000-000000000001';

SELECT is(
  (
    SELECT count(*)
    FROM private.deckdealr_sale_observations
    WHERE transaction_id = '63000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'a completed transaction creates exactly one observation'
);

SELECT is(
  (
    SELECT card_price
    FROM private.deckdealr_sale_observations
    WHERE transaction_id = '63000000-0000-4000-8000-000000000001'
  ),
  102::numeric,
  'the frozen card price excludes shipping'
);

SELECT results_eq(
  $$
    SELECT card_key, condition, language, is_graded, variant
    FROM private.deckdealr_sale_observations
    WHERE transaction_id = '63000000-0000-4000-8000-000000000001'
  $$,
  $$
    VALUES (
      'fr-sales-observation-1'::text,
      'NEAR_MINT'::text,
      'fr'::text,
      FALSE,
      'holo'::text
    )
  $$,
  'the listing attributes are frozen without buyer or seller data'
);

UPDATE public.transactions
SET updated_at = now()
WHERE id = '63000000-0000-4000-8000-000000000001';

SELECT is(
  (
    SELECT count(*)
    FROM private.deckdealr_sale_observations
    WHERE transaction_id = '63000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'unrelated updates cannot duplicate an observation'
);

SELECT is(
  (
    SELECT sales_volume
    FROM public.get_deckdealr_sales_summary(
      p_card_key => 'fr-sales-observation-1',
      p_variant => 'holo',
      p_condition => 'NEAR_MINT',
      p_limit => 12
    )
  ),
  1::bigint,
  'the aggregate RPC returns the completed sale'
);

SELECT is(
  (
    SELECT median_price
    FROM public.get_deckdealr_sales_summary(
      p_card_key => 'fr-sales-observation-1',
      p_variant => 'holo',
      p_condition => 'NEAR_MINT',
      p_limit => 12
    )
  ),
  102::numeric,
  'the aggregate RPC computes the median'
);

UPDATE public.transactions
SET refunded_amount_minor = 100
WHERE id = '63000000-0000-4000-8000-000000000001';

SELECT ok(
  (
    SELECT excluded_from_aggregates
    FROM private.deckdealr_sale_observations
    WHERE transaction_id = '63000000-0000-4000-8000-000000000001'
  ),
  'a partial refund marks the observation as excluded'
);

SELECT is(
  (
    SELECT sales_volume
    FROM public.get_deckdealr_sales_summary(
      p_card_key => 'fr-sales-observation-1',
      p_variant => 'holo',
      p_condition => 'NEAR_MINT',
      p_limit => 12
    )
  ),
  0::bigint,
  'a refunded sale no longer affects aggregates'
);

SELECT * FROM finish();
ROLLBACK;
