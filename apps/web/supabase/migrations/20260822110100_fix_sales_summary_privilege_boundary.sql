BEGIN;

-- public.get_pokemarket_sales_summary was created as SECURITY INVOKER after
-- USAGE on schema private was revoked from anon/authenticated. The wrapper
-- therefore cannot resolve private.get_pokemarket_sales_summary, and every
-- public /api/cards/[card_key]/sales call fails with SQLSTATE 42501.
--
-- The private implementation already returns only anonymised aggregates and
-- contains no buyer/seller identifiers. Execute it with the function owner's
-- privileges, matching the escrow public-wrapper pattern.

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
SECURITY DEFINER
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

REVOKE ALL ON FUNCTION private.get_pokemarket_sales_summary(
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  TEXT,
  NUMERIC,
  INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.get_pokemarket_sales_summary(
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  TEXT,
  NUMERIC,
  INTEGER
) TO service_role;

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
