-- Migration: Multi-field, accent-insensitive search for TCGdex catalog
-- ─────────────────────────────────────────────────────────────────────
-- 1. Installs the `unaccent` extension (idempotent).
-- 2. Replaces `match_tcgdex_cards` so it:
--      - matches the query on card.name, set.name AND series.name
--      - is insensitive to case and to diacritics (é = e, ñ = n, …)
--      - accepts an optional `p_local_id` to narrow by card number
--      - ranks results: exact name > name prefix > name substring > set match > series match

CREATE EXTENSION IF NOT EXISTS unaccent;

DROP FUNCTION IF EXISTS public.match_tcgdex_cards(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.match_tcgdex_cards(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.match_tcgdex_cards(
  p_name      TEXT,
  p_language  TEXT DEFAULT NULL,
  p_local_id  TEXT DEFAULT NULL
)
RETURNS TABLE (
  card_language     TEXT,
  card_id           TEXT,
  card_key          TEXT,
  card_name         TEXT,
  card_set_id       TEXT,
  card_hp           INTEGER,
  card_rarity       TEXT,
  card_illustrator  TEXT,
  card_local_id     TEXT,
  set_name          TEXT,
  series_id         TEXT,
  series_name       TEXT,
  set_official_count INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  WITH q AS (
    SELECT unaccent(lower(coalesce(p_name, ''))) AS needle
  )
  SELECT
    c.language          AS card_language,
    c.id                AS card_id,
    c.card_key          AS card_key,
    c.name              AS card_name,
    c.set_id            AS card_set_id,
    c.hp                AS card_hp,
    c.rarity            AS card_rarity,
    c.illustrator       AS card_illustrator,
    c.local_id          AS card_local_id,
    s.name              AS set_name,
    s.series_id         AS series_id,
    sr.name             AS series_name,
    (s.card_count ->> 'official')::INTEGER AS set_official_count
  FROM public.tcgdex_cards c
  CROSS JOIN q
  LEFT JOIN public.tcgdex_sets   s  ON s.id  = c.set_id    AND s.language  = c.language
  LEFT JOIN public.tcgdex_series sr ON sr.id = s.series_id AND sr.language = c.language
  WHERE
    (p_language IS NULL OR c.language = p_language)
    AND (
      q.needle = ''
      OR unaccent(lower(c.name))  LIKE '%' || q.needle || '%'
      OR unaccent(lower(s.name))  LIKE '%' || q.needle || '%'
      OR unaccent(lower(sr.name)) LIKE '%' || q.needle || '%'
    )
    AND (
      p_local_id IS NULL
      OR c.local_id IS NOT NULL
         AND ltrim(c.local_id, '0') = ltrim(p_local_id, '0')
    )
  ORDER BY
    CASE
      WHEN q.needle = '' THEN 9
      WHEN unaccent(lower(c.name)) = q.needle THEN 0
      WHEN unaccent(lower(c.name)) LIKE q.needle || '%' THEN 1
      WHEN unaccent(lower(c.name)) LIKE '%' || q.needle || '%' THEN 2
      WHEN unaccent(lower(s.name)) LIKE '%' || q.needle || '%' THEN 3
      WHEN unaccent(lower(sr.name)) LIKE '%' || q.needle || '%' THEN 4
      ELSE 5
    END,
    c.name NULLS LAST,
    c.local_id NULLS LAST
  LIMIT 30;
$$;

COMMENT ON FUNCTION public.match_tcgdex_cards(TEXT, TEXT, TEXT) IS
  'Searches the TCGdex catalog (cards + sets + series) by free text, insensitive to case and accents. Optional p_local_id narrows by card number (leading zeros ignored). Used by the marketplace search bar and OCR matcher.';
