-- Add last_seen_at so we know which listings are "new" for a saved search
ALTER TABLE saved_searches
  ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: existing rows should use created_at as initial last_seen_at
UPDATE saved_searches SET last_seen_at = created_at;

-- Allow owners to update their own saved searches (needed for last_seen_at)
CREATE POLICY "saved_searches_update_own" ON saved_searches
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- RPC: count new listings matching each of the caller's saved searches
CREATE OR REPLACE FUNCTION count_new_for_saved_searches()
RETURNS TABLE (search_id UUID, new_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  rec RECORD;
  cnt BIGINT;
BEGIN
  FOR rec IN
    SELECT s.id, s.search_params, s.last_seen_at
    FROM public.saved_searches s
    WHERE s.user_id = (SELECT auth.uid())
  LOOP
    SELECT COUNT(*) INTO cnt
    FROM public.listings l
    WHERE l.status = 'ACTIVE'
      AND l.created_at > rec.last_seen_at
      AND (
        rec.search_params->>'q' IS NULL
        OR l.title ILIKE '%' || (rec.search_params->>'q') || '%'
      )
      AND (
        rec.search_params->>'set' IS NULL
        OR l.card_series = rec.search_params->>'set'
      )
      AND (
        rec.search_params->>'rarity' IS NULL
        OR EXISTS (
          SELECT 1 FROM public.tcgdex_cards tc
          WHERE tc.id = l.card_ref_id
            AND tc.rarity = rec.search_params->>'rarity'
        )
      )
      AND (
        rec.search_params->>'condition' IS NULL
        OR l.condition = rec.search_params->>'condition'
      )
      AND (
        rec.search_params->>'is_graded' IS NULL
        OR l.is_graded = (rec.search_params->>'is_graded')::boolean
      )
      AND (
        rec.search_params->>'grade_min' IS NULL
        OR l.grade_note >= (rec.search_params->>'grade_min')::numeric
      )
      AND (
        rec.search_params->>'grade_max' IS NULL
        OR l.grade_note <= (rec.search_params->>'grade_max')::numeric
      )
      AND (
        rec.search_params->>'price_min' IS NULL
        OR l.display_price >= (rec.search_params->>'price_min')::numeric
      )
      AND (
        rec.search_params->>'price_max' IS NULL
        OR l.display_price <= (rec.search_params->>'price_max')::numeric
      )
      AND (
        rec.search_params->>'card_number' IS NULL
        OR l.card_number = rec.search_params->>'card_number'
      )
      AND (
        rec.search_params->>'series' IS NULL
        OR l.card_block = rec.search_params->>'series'
      );

    IF cnt > 0 THEN
      search_id := rec.id;
      new_count := cnt;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;
