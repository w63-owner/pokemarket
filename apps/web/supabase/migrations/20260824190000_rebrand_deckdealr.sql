-- DeckDealr rebranding migration.
--
-- Renames the private.pokemarket_sale_observations table and all related
-- objects to the deckdealr_* namespace.  The old public wrapper function
-- get_pokemarket_sales_summary is kept as a backward-compat shim so any
-- deployment in-flight is not broken (it can be dropped in the next sprint).
--
-- Historic migrations are NOT modified.

BEGIN;

-- ------------------------------------------------------------------ --
-- 1. Rename observation table and its constraints / indexes           --
-- ------------------------------------------------------------------ --

ALTER TABLE private.pokemarket_sale_observations
  RENAME TO deckdealr_sale_observations;

ALTER INDEX private.pokemarket_sale_observations_aggregate_idx
  RENAME TO deckdealr_sale_observations_aggregate_idx;

ALTER INDEX private.pokemarket_sale_observations_ungraded_filter_idx
  RENAME TO deckdealr_sale_observations_ungraded_filter_idx;

ALTER INDEX private.pokemarket_sale_observations_graded_filter_idx
  RENAME TO deckdealr_sale_observations_graded_filter_idx;

ALTER TABLE private.deckdealr_sale_observations
  RENAME CONSTRAINT pokemarket_sale_observations_variant_check
  TO deckdealr_sale_observations_variant_check;

-- ------------------------------------------------------------------ --
-- 2. Replace trigger function                                         --
-- ------------------------------------------------------------------ --

-- Recreate capture function pointing at new table name.
CREATE OR REPLACE FUNCTION private.capture_deckdealr_sale_observation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_card_key TEXT;
  v_card_price NUMERIC;
  v_condition TEXT;
  v_grading_company TEXT;
  v_grade_note NUMERIC;
  v_is_graded BOOLEAN;
  v_language TEXT;
  v_variant TEXT;
BEGIN
  -- Only capture completed (COMPLETED status) sales.
  IF NEW.status <> 'COMPLETED' OR OLD.status = 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  SELECT
    l.card_key,
    NEW.total_amount - NEW.fee_amount - COALESCE(NEW.shipping_cost, 0),
    l.card_condition,
    l.grading_company,
    l.grade_note,
    l.is_graded,
    l.language,
    l.variant
  INTO
    v_card_key,
    v_card_price,
    v_condition,
    v_grading_company,
    v_grade_note,
    v_is_graded,
    v_language,
    v_variant
  FROM public.listings AS l
  WHERE l.id = NEW.listing_id;

  IF v_card_key IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO private.deckdealr_sale_observations (
    card_key,
    card_price,
    condition,
    grading_company,
    grade_note,
    is_graded,
    language,
    sold_at,
    variant
  ) VALUES (
    v_card_key,
    v_card_price,
    v_condition,
    v_grading_company,
    v_grade_note,
    COALESCE(v_is_graded, FALSE),
    COALESCE(v_language, 'fr'),
    NOW(),
    COALESCE(v_variant, 'normal')
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.capture_deckdealr_sale_observation() FROM PUBLIC;

-- Drop old trigger and function.
DROP TRIGGER IF EXISTS capture_pokemarket_sale_observation
  ON public.transactions;

CREATE TRIGGER capture_deckdealr_sale_observation
  AFTER UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_deckdealr_sale_observation();

DROP FUNCTION IF EXISTS private.capture_pokemarket_sale_observation();

-- ------------------------------------------------------------------ --
-- 3. Replace private summary function                                 --
-- ------------------------------------------------------------------ --

CREATE OR REPLACE FUNCTION private.get_deckdealr_sales_summary(
  p_card_key TEXT,
  p_variant TEXT DEFAULT NULL,
  p_condition TEXT DEFAULT NULL,
  p_is_graded BOOLEAN DEFAULT FALSE,
  p_grading_company TEXT DEFAULT NULL,
  p_grade_note NUMERIC DEFAULT NULL,
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
      observations.condition,
      observations.grading_company,
      observations.grade_note,
      observations.is_graded,
      observations.sold_at,
      observations.variant
    FROM private.deckdealr_sale_observations AS observations
    WHERE observations.card_key = p_card_key
      AND observations.language = 'fr'
      AND observations.excluded_from_aggregates = FALSE
      AND observations.is_graded = p_is_graded
      AND (p_variant IS NULL OR observations.variant = p_variant)
      AND (
        p_is_graded
        OR (p_condition IS NULL OR observations.condition = p_condition)
      )
      AND (
        NOT p_is_graded
        OR (
          (p_grading_company IS NULL OR observations.grading_company = p_grading_company)
          AND (p_grade_note IS NULL OR observations.grade_note = p_grade_note)
        )
      )
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
    SELECT *
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
            'condition', recent.condition,
            'grade_note', recent.grade_note,
            'grading_company', recent.grading_company,
            'is_graded', recent.is_graded,
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

REVOKE ALL ON FUNCTION private.get_deckdealr_sales_summary(
  TEXT, TEXT, TEXT, BOOLEAN, TEXT, NUMERIC, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.get_deckdealr_sales_summary(
  TEXT, TEXT, TEXT, BOOLEAN, TEXT, NUMERIC, INTEGER
) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------ --
-- 4. Replace public entry-point function                              --
-- ------------------------------------------------------------------ --

DROP FUNCTION IF EXISTS public.get_deckdealr_sales_summary(
  TEXT, TEXT, TEXT, BOOLEAN, TEXT, NUMERIC, INTEGER
);

CREATE FUNCTION public.get_deckdealr_sales_summary(
  p_card_key TEXT,
  p_variant TEXT DEFAULT NULL,
  p_condition TEXT DEFAULT NULL,
  p_is_graded BOOLEAN DEFAULT FALSE,
  p_grading_company TEXT DEFAULT NULL,
  p_grade_note NUMERIC DEFAULT NULL,
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
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM private.get_deckdealr_sales_summary(
    p_card_key,
    p_variant,
    p_condition,
    p_is_graded,
    p_grading_company,
    p_grade_note,
    p_limit
  );
$$;

REVOKE ALL ON FUNCTION public.get_deckdealr_sales_summary(
  TEXT, TEXT, TEXT, BOOLEAN, TEXT, NUMERIC, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_deckdealr_sales_summary(
  TEXT, TEXT, TEXT, BOOLEAN, TEXT, NUMERIC, INTEGER
) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_deckdealr_sales_summary(
  TEXT, TEXT, TEXT, BOOLEAN, TEXT, NUMERIC, INTEGER
) IS
  'Returns anonymised completed-sale aggregates for one homogeneous French card segment; refunded sales are excluded.';

-- ------------------------------------------------------------------ --
-- 5. Backward-compat shim (drop after next full deploy)              --
-- ------------------------------------------------------------------ --

-- Keep old public wrapper alive so any in-flight request during the
-- rolling deploy does not 500.  Drop this shim in the next migration.
CREATE OR REPLACE FUNCTION public.get_pokemarket_sales_summary(
  p_card_key TEXT,
  p_variant TEXT DEFAULT NULL,
  p_condition TEXT DEFAULT NULL,
  p_is_graded BOOLEAN DEFAULT FALSE,
  p_grading_company TEXT DEFAULT NULL,
  p_grade_note NUMERIC DEFAULT NULL,
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
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM public.get_deckdealr_sales_summary(
    p_card_key, p_variant, p_condition,
    p_is_graded, p_grading_company, p_grade_note, p_limit
  );
$$;

REVOKE ALL ON FUNCTION public.get_pokemarket_sales_summary(
  TEXT, TEXT, TEXT, BOOLEAN, TEXT, NUMERIC, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_pokemarket_sales_summary(
  TEXT, TEXT, TEXT, BOOLEAN, TEXT, NUMERIC, INTEGER
) TO anon, authenticated, service_role;

-- Drop old private function (now replaced by deckdealr variant).
DROP FUNCTION IF EXISTS private.get_pokemarket_sales_summary(
  TEXT, TEXT, TEXT, BOOLEAN, TEXT, NUMERIC, INTEGER
);

COMMIT;
