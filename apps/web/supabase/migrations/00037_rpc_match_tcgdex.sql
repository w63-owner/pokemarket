-- Migration: RPC match_tcgdex_cards
-- Replaces 3 sequential queries (cards → sets → series) in the OCR endpoint
-- with a single JOIN-based function call.

CREATE OR REPLACE FUNCTION match_tcgdex_cards(
  p_name      TEXT,
  p_language  TEXT DEFAULT NULL
)
RETURNS TABLE (
  card_language   TEXT,
  card_id         TEXT,
  card_key        TEXT,
  card_name       TEXT,
  card_set_id     TEXT,
  card_hp         INTEGER,
  card_rarity     TEXT,
  card_illustrator TEXT,
  card_local_id   TEXT,
  set_name        TEXT,
  series_id       TEXT,
  series_name     TEXT,
  set_official_count INTEGER
)
LANGUAGE sql STABLE
AS $$
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
  FROM tcgdex_cards c
  LEFT JOIN tcgdex_sets   s  ON s.id = c.set_id AND s.language = c.language
  LEFT JOIN tcgdex_series sr ON sr.id = s.series_id AND sr.language = c.language
  WHERE c.name ILIKE ('%' || p_name || '%')
    AND (p_language IS NULL OR c.language = p_language)
  LIMIT 20;
$$;

COMMENT ON FUNCTION match_tcgdex_cards(TEXT, TEXT) IS
  'Single-query card matching for OCR: joins cards, sets, and series in one round-trip.';
