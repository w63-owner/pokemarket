BEGIN;

CREATE INDEX pokemarket_sale_observations_ungraded_filter_idx
  ON private.pokemarket_sale_observations
    (card_key, variant, condition, sold_at DESC)
  INCLUDE (card_price)
  WHERE excluded_from_aggregates = FALSE
    AND is_graded = FALSE;

CREATE INDEX pokemarket_sale_observations_graded_filter_idx
  ON private.pokemarket_sale_observations
    (card_key, variant, grading_company, grade_note, sold_at DESC)
  INCLUDE (card_price)
  WHERE excluded_from_aggregates = FALSE
    AND is_graded = TRUE;

DROP FUNCTION public.get_pokemarket_sales_summary(TEXT, TEXT, INTEGER);

CREATE FUNCTION private.get_pokemarket_sales_summary(
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
    FROM private.pokemarket_sale_observations AS observations
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

REVOKE ALL ON FUNCTION private.get_pokemarket_sales_summary(
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  TEXT,
  NUMERIC,
  INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.get_pokemarket_sales_summary(
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  TEXT,
  NUMERIC,
  INTEGER
) TO anon, authenticated, service_role;

CREATE FUNCTION public.get_pokemarket_sales_summary(
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
  FROM private.get_pokemarket_sales_summary(
    p_card_key,
    p_variant,
    p_condition,
    p_is_graded,
    p_grading_company,
    p_grade_note,
    p_limit
  );
$$;

REVOKE ALL ON FUNCTION public.get_pokemarket_sales_summary(
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  TEXT,
  NUMERIC,
  INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_pokemarket_sales_summary(
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  TEXT,
  NUMERIC,
  INTEGER
) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_pokemarket_sales_summary(
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  TEXT,
  NUMERIC,
  INTEGER
) IS
  'Returns anonymised completed-sale aggregates for one homogeneous French card segment; refunded sales are excluded.';

COMMIT;
