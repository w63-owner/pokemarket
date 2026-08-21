BEGIN;

-- The selected printing is part of the listing and must be frozen with the
-- completed sale. Legacy listings remain NULL because inventing a variant
-- would make their observations misleading.
ALTER TABLE public.listings
  ADD COLUMN card_variant TEXT;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_card_variant_check
  CHECK (card_variant IN ('normal', 'holo'));

COMMENT ON COLUMN public.listings.card_variant IS
  'Physical printing selected by the seller; NULL only for legacy or unidentified listings.';

-- Sale observations live outside the exposed public schema. They deliberately
-- contain no buyer/seller identifiers and can only be read through the
-- anonymising aggregate RPC below.
CREATE TABLE private.pokemarket_sale_observations (
  transaction_id UUID PRIMARY KEY
    REFERENCES public.transactions(id) ON DELETE RESTRICT,
  card_key TEXT NOT NULL REFERENCES public.tcgdex_cards(card_key),
  card_price NUMERIC(10, 2) NOT NULL CHECK (card_price > 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  condition TEXT,
  language TEXT NOT NULL,
  is_graded BOOLEAN NOT NULL,
  grading_company TEXT,
  grade_note NUMERIC(3, 1),
  variant TEXT,
  sold_at TIMESTAMPTZ NOT NULL,
  excluded_from_aggregates BOOLEAN NOT NULL DEFAULT FALSE,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pokemarket_sale_observations_variant_check
    CHECK (variant IN ('normal', 'holo'))
);

CREATE INDEX pokemarket_sale_observations_aggregate_idx
  ON private.pokemarket_sale_observations
    (card_key, variant, sold_at DESC)
  INCLUDE (card_price, condition)
  WHERE excluded_from_aggregates = FALSE
    AND is_graded = FALSE;

REVOKE ALL ON TABLE private.pokemarket_sale_observations
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.capture_pokemarket_sale_observation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_listing public.listings%ROWTYPE;
  v_card_price NUMERIC(10, 2);
BEGIN
  -- Both manual confirmation and the automatic completion cron converge on
  -- this transition, so one trigger covers both paths atomically.
  IF NEW.status = 'COMPLETED'
     AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN
    SELECT *
    INTO v_listing
    FROM public.listings
    WHERE id = NEW.listing_id;

    v_card_price := round(
      NEW.total_amount - COALESCE(NEW.shipping_cost, 0),
      2
    );

    IF v_listing.card_ref_id IS NOT NULL AND v_card_price > 0 THEN
      INSERT INTO private.pokemarket_sale_observations (
        transaction_id,
        card_key,
        card_price,
        condition,
        language,
        is_graded,
        grading_company,
        grade_note,
        variant,
        sold_at,
        excluded_from_aggregates,
        refunded_at
      )
      VALUES (
        NEW.id,
        v_listing.card_ref_id,
        v_card_price,
        v_listing.condition,
        lower(COALESCE(v_listing.card_language, 'fr')),
        COALESCE(v_listing.is_graded, FALSE),
        v_listing.grading_company,
        v_listing.grade_note,
        v_listing.card_variant,
        COALESCE(NEW.updated_at, now()),
        COALESCE(NEW.refunded_amount_minor, 0) > 0,
        CASE
          WHEN COALESCE(NEW.refunded_amount_minor, 0) > 0
            THEN COALESCE(NEW.refunded_at, now())
          ELSE NULL
        END
      )
      ON CONFLICT (transaction_id) DO NOTHING;
    END IF;
  END IF;

  -- Any partial or full refund excludes the complete sale price. This avoids
  -- overstating the market until net-price observations are explicitly
  -- modelled in a later iteration.
  IF (
    NEW.status = 'REFUNDED'
    OR COALESCE(NEW.refunded_amount_minor, 0) > 0
  ) THEN
    UPDATE private.pokemarket_sale_observations
    SET excluded_from_aggregates = TRUE,
        refunded_at = COALESCE(NEW.refunded_at, refunded_at, now())
    WHERE transaction_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.capture_pokemarket_sale_observation()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER capture_pokemarket_sale_observation
  AFTER UPDATE OF status, refunded_amount_minor ON public.transactions
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.refunded_amount_minor IS DISTINCT FROM NEW.refunded_amount_minor
  )
  EXECUTE FUNCTION private.capture_pokemarket_sale_observation();

-- Preserve already-completed real sales when deploying the feature. Unknown
-- variants stay NULL and are included only in the unfiltered aggregate.
INSERT INTO private.pokemarket_sale_observations (
  transaction_id,
  card_key,
  card_price,
  condition,
  language,
  is_graded,
  grading_company,
  grade_note,
  variant,
  sold_at,
  excluded_from_aggregates,
  refunded_at
)
SELECT
  transactions.id,
  listings.card_ref_id,
  round(
    transactions.total_amount - COALESCE(transactions.shipping_cost, 0),
    2
  ),
  listings.condition,
  lower(COALESCE(listings.card_language, 'fr')),
  COALESCE(listings.is_graded, FALSE),
  listings.grading_company,
  listings.grade_note,
  listings.card_variant,
  COALESCE(transactions.updated_at, transactions.created_at, now()),
  COALESCE(transactions.refunded_amount_minor, 0) > 0,
  transactions.refunded_at
FROM public.transactions AS transactions
JOIN public.listings AS listings
  ON listings.id = transactions.listing_id
WHERE transactions.status = 'COMPLETED'
  AND listings.card_ref_id IS NOT NULL
  AND transactions.total_amount - COALESCE(transactions.shipping_cost, 0) > 0
ON CONFLICT (transaction_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_pokemarket_sales_summary(
  p_card_key TEXT,
  p_variant TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 12
)
RETURNS TABLE (
  median_price NUMERIC,
  average_price NUMERIC,
  sales_volume BIGINT,
  last_sold_at TIMESTAMPTZ,
  recent_sales JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH eligible AS (
    SELECT
      observations.card_price,
      observations.sold_at,
      observations.variant
    FROM private.pokemarket_sale_observations AS observations
    WHERE observations.card_key = p_card_key
      AND observations.language = 'fr'
      AND observations.is_graded = FALSE
      AND observations.excluded_from_aggregates = FALSE
      AND (p_variant IS NULL OR observations.variant = p_variant)
  ),
  summary AS (
    SELECT
      round(
        percentile_cont(0.5) WITHIN GROUP (ORDER BY card_price)::NUMERIC,
        2
      ) AS median_price,
      round(avg(card_price), 2) AS average_price,
      count(*) AS sales_volume,
      max(sold_at) AS last_sold_at
    FROM eligible
  ),
  recent AS (
    SELECT card_price, sold_at, variant
    FROM eligible
    ORDER BY sold_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 50)
  )
  SELECT
    summary.median_price,
    summary.average_price,
    summary.sales_volume,
    summary.last_sold_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'price', recent.card_price,
            'sold_at', recent.sold_at,
            'variant', recent.variant
          )
          ORDER BY recent.sold_at
        )
        FROM recent
      ),
      '[]'::JSONB
    )
  FROM summary;
$$;

REVOKE ALL ON FUNCTION public.get_pokemarket_sales_summary(TEXT, TEXT, INTEGER)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pokemarket_sales_summary(TEXT, TEXT, INTEGER)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_pokemarket_sales_summary(TEXT, TEXT, INTEGER) IS
  'Returns anonymised, non-graded French PokeMarket completed-sale aggregates; refunded sales are excluded.';

COMMIT;
