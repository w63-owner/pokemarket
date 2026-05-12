-- Drop the old overload (15 params, without p_card_number / p_series)
DROP FUNCTION IF EXISTS public.search_listings_feed(
  TEXT, TEXT, TEXT, TEXT, BOOLEAN,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  TEXT, TIMESTAMPTZ, UUID, NUMERIC, INTEGER, UUID
);

-- Drop the new overload (17 params) in case it partially exists
DROP FUNCTION IF EXISTS public.search_listings_feed(
  TEXT, TEXT, TEXT, TEXT, BOOLEAN,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, NUMERIC, INTEGER, UUID
);

-- Recreate the single correct version with p_card_number & p_series
CREATE OR REPLACE FUNCTION search_listings_feed(
  p_query TEXT DEFAULT NULL,
  p_set TEXT DEFAULT NULL,
  p_rarity TEXT DEFAULT NULL,
  p_condition TEXT DEFAULT NULL,
  p_is_graded BOOLEAN DEFAULT NULL,
  p_grade_min NUMERIC DEFAULT NULL,
  p_grade_max NUMERIC DEFAULT NULL,
  p_price_min NUMERIC DEFAULT NULL,
  p_price_max NUMERIC DEFAULT NULL,
  p_card_number TEXT DEFAULT NULL,
  p_series TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT 'date_desc',
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_cursor_price NUMERIC DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_exclude_seller UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  seller_id UUID,
  title TEXT,
  display_price NUMERIC,
  condition TEXT,
  is_graded BOOLEAN,
  grade_note NUMERIC,
  cover_image_url TEXT,
  card_series TEXT,
  created_at TIMESTAMPTZ,
  seller_username TEXT,
  seller_avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id, l.seller_id, l.title, l.display_price,
    l.condition, l.is_graded, l.grade_note,
    l.cover_image_url, l.card_series, l.created_at,
    p.username AS seller_username,
    p.avatar_url AS seller_avatar_url
  FROM public.listings l
  JOIN public.profiles p ON p.id = l.seller_id
  WHERE l.status = 'ACTIVE'
    AND (p_exclude_seller IS NULL OR l.seller_id != p_exclude_seller)
    AND (p_query IS NULL OR l.title ILIKE '%' || p_query || '%')
    AND (p_set IS NULL OR l.card_series = p_set)
    AND (p_rarity IS NULL OR EXISTS (
      SELECT 1 FROM public.tcgdex_cards tc
      WHERE tc.id = l.card_ref_id AND tc.rarity = p_rarity
    ))
    AND (p_condition IS NULL OR l.condition = p_condition)
    AND (p_is_graded IS NULL OR l.is_graded = p_is_graded)
    AND (p_grade_min IS NULL OR l.grade_note >= p_grade_min)
    AND (p_grade_max IS NULL OR l.grade_note <= p_grade_max)
    AND (p_price_min IS NULL OR l.display_price >= p_price_min)
    AND (p_price_max IS NULL OR l.display_price <= p_price_max)
    AND (p_card_number IS NULL OR l.card_number = p_card_number)
    AND (p_series IS NULL OR l.card_block = p_series)
    AND (
      CASE p_sort
        WHEN 'date_desc' THEN
          p_cursor_created_at IS NULL
          OR (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
        WHEN 'price_asc' THEN
          p_cursor_price IS NULL
          OR (l.display_price, l.id) > (p_cursor_price, p_cursor_id)
        WHEN 'price_desc' THEN
          p_cursor_price IS NULL
          OR (l.display_price, l.id) < (p_cursor_price, p_cursor_id)
        ELSE TRUE
      END
    )
  ORDER BY
    CASE WHEN p_sort = 'date_desc' THEN l.created_at END DESC,
    CASE WHEN p_sort = 'price_asc' THEN l.display_price END ASC,
    CASE WHEN p_sort = 'price_desc' THEN l.display_price END DESC,
    l.id
  LIMIT LEAST(p_limit, 50);
END;
$$;
