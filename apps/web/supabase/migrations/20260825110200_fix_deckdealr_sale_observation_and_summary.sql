-- Restore sale-observation capture after the DeckDealr rebrand rewrite, and
-- close the public sales-summary privilege boundary.
--
-- 20260824190000 replaced private.capture_pokemarket_sale_observation with a
-- new function that:
--   * reads listings.card_key / card_condition / language / variant, which
--     do not exist (the columns are card_ref_id / condition / card_language /
--     card_variant);
--   * omits transaction_id, the observation primary key;
--   * records seller-net instead of the buyer-facing card price;
--   * drops refund exclusion.
-- The trigger therefore raises on every SHIPPED → COMPLETED update and rolls
-- back confirm-reception / auto-complete / escrow release.
--
-- The same migration also recreated public.get_deckdealr_sales_summary as
-- SECURITY INVOKER into private.* after USAGE on schema private was revoked
-- from JWT roles. Public /api/cards/[card_key]/sales calls therefore fail
-- with SQLSTATE 42501 (same class as the unmerged #118 pokemarket wrapper).

BEGIN;

CREATE OR REPLACE FUNCTION private.capture_deckdealr_sale_observation()
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
      INSERT INTO private.deckdealr_sale_observations (
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
    UPDATE private.deckdealr_sale_observations
    SET excluded_from_aggregates = TRUE,
        refunded_at = COALESCE(NEW.refunded_at, refunded_at, now())
    WHERE transaction_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.capture_deckdealr_sale_observation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS capture_deckdealr_sale_observation
  ON public.transactions;

CREATE TRIGGER capture_deckdealr_sale_observation
  AFTER UPDATE OF status, refunded_amount_minor ON public.transactions
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.refunded_amount_minor IS DISTINCT FROM NEW.refunded_amount_minor
  )
  EXECUTE FUNCTION private.capture_deckdealr_sale_observation();

CREATE OR REPLACE FUNCTION public.get_deckdealr_sales_summary(
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

REVOKE ALL ON FUNCTION private.get_deckdealr_sales_summary(
  TEXT, TEXT, TEXT, BOOLEAN, TEXT, NUMERIC, INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.get_deckdealr_sales_summary(
  TEXT, TEXT, TEXT, BOOLEAN, TEXT, NUMERIC, INTEGER
) TO service_role;

COMMENT ON FUNCTION public.get_deckdealr_sales_summary(
  TEXT, TEXT, TEXT, BOOLEAN, TEXT, NUMERIC, INTEGER
) IS
  'Returns anonymised completed-sale aggregates for one homogeneous French card segment; refunded sales are excluded.';

COMMIT;
