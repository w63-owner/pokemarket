-- Enrich Cardmarket observations with the dimensions required for daily,
-- idempotent snapshots and fast current-price rankings.
ALTER TABLE public.card_price_history
  ADD COLUMN variant TEXT,
  ADD COLUMN currency TEXT,
  ADD COLUMN snapshot_date DATE;

UPDATE public.card_price_history
SET
  variant = 'normal',
  currency = 'EUR',
  snapshot_date = (recorded_at AT TIME ZONE 'UTC')::date
WHERE variant IS NULL
   OR currency IS NULL
   OR snapshot_date IS NULL;

ALTER TABLE public.card_price_history
  ALTER COLUMN variant SET NOT NULL,
  ALTER COLUMN variant SET DEFAULT 'normal',
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'EUR',
  ALTER COLUMN snapshot_date SET NOT NULL,
  ALTER COLUMN snapshot_date SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;

-- Historical utility rows were not daily-idempotent. Keep only the latest
-- usable observation for each new uniqueness key before adding constraints.
DELETE FROM public.card_price_history
WHERE price <= 0;

WITH duplicate_snapshots AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY card_key, variant, source, snapshot_date
      ORDER BY recorded_at DESC, id DESC
    ) AS duplicate_rank
  FROM public.card_price_history
)
DELETE FROM public.card_price_history AS history
USING duplicate_snapshots
WHERE history.id = duplicate_snapshots.id
  AND duplicate_snapshots.duplicate_rank > 1;

ALTER TABLE public.card_price_history
  ADD CONSTRAINT card_price_history_variant_check
    CHECK (variant IN ('normal', 'holo')),
  ADD CONSTRAINT card_price_history_currency_check
    CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT card_price_history_price_check
    CHECK (price > 0);

CREATE UNIQUE INDEX uq_card_price_history_daily_snapshot
  ON public.card_price_history (card_key, variant, source, snapshot_date);

CREATE INDEX idx_card_price_history_current_ranking
  ON public.card_price_history (source, snapshot_date DESC, price DESC)
  INCLUDE (card_key, variant, currency, recorded_at);

COMMENT ON COLUMN public.card_price_history.variant IS
  'Physical Cardmarket printing variant represented by this observation.';
COMMENT ON COLUMN public.card_price_history.snapshot_date IS
  'UTC collection day used as the daily idempotency boundary.';

-- One durable cursor per source/language/day lets short cron invocations resume
-- without re-fetching the whole French catalog.
CREATE TABLE public.card_price_collection_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  language TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  cursor_card_key TEXT,
  total_cards INTEGER NOT NULL DEFAULT 0 CHECK (total_cards >= 0),
  processed_cards INTEGER NOT NULL DEFAULT 0 CHECK (processed_cards >= 0),
  priced_cards INTEGER NOT NULL DEFAULT 0 CHECK (priced_cards >= 0),
  failed_cards INTEGER NOT NULL DEFAULT 0 CHECK (failed_cards >= 0),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'partial', 'completed')),
  last_error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (source, language, snapshot_date)
);

CREATE INDEX idx_card_price_collection_runs_resume
  ON public.card_price_collection_runs (source, language, snapshot_date DESC);

ALTER TABLE public.card_price_collection_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.card_price_collection_runs FROM anon, authenticated;

CREATE POLICY "card_price_collection_runs_select_completed"
  ON public.card_price_collection_runs
  FOR SELECT
  TO anon, authenticated
  USING (status = 'completed');

GRANT SELECT (source, language, snapshot_date, status)
  ON public.card_price_collection_runs
  TO anon, authenticated;

-- Return at most one (the most valuable) variant per card from the most recent
-- completed UTC day. This prevents a partial batch or holo/normal copies of one
-- card from making the Top 10 inaccurate.
CREATE OR REPLACE FUNCTION public.get_current_cardmarket_top(
  p_language TEXT DEFAULT 'fr',
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  rank BIGINT,
  card_key TEXT,
  card_name TEXT,
  card_set_id TEXT,
  set_name TEXT,
  series_id TEXT,
  series_name TEXT,
  card_local_id TEXT,
  set_official_count INTEGER,
  card_rarity TEXT,
  card_language TEXT,
  variant TEXT,
  price NUMERIC,
  currency TEXT,
  snapshot_date DATE,
  price_updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH latest_day AS (
    SELECT max(runs.snapshot_date) AS snapshot_date
    FROM public.card_price_collection_runs AS runs
    WHERE runs.source = 'CARDMARKET_TCGDEX'
      AND runs.language = p_language
      AND runs.status = 'completed'
  ),
  best_variant_per_card AS (
    SELECT DISTINCT ON (history.card_key)
      history.card_key,
      history.variant,
      history.price,
      history.currency,
      history.snapshot_date,
      history.recorded_at
    FROM public.card_price_history AS history
    CROSS JOIN latest_day
    WHERE history.source = 'CARDMARKET_TCGDEX'
      AND history.language = p_language
      AND history.is_graded = false
      AND history.snapshot_date = latest_day.snapshot_date
    ORDER BY history.card_key, history.price DESC, history.variant
  ),
  top_cards AS (
    SELECT *
    FROM best_variant_per_card
    ORDER BY price DESC, card_key
    LIMIT LEAST(GREATEST(p_limit, 1), 50)
  )
  SELECT
    row_number() OVER (ORDER BY top_cards.price DESC, top_cards.card_key),
    cards.card_key,
    COALESCE(cards.name, 'Carte inconnue'),
    cards.set_id,
    sets.name,
    sets.series_id,
    series.name,
    cards.local_id,
    CASE
      WHEN jsonb_typeof(sets.card_count) = 'object'
        AND (sets.card_count ->> 'official') ~ '^[0-9]+$'
      THEN (sets.card_count ->> 'official')::integer
      ELSE NULL
    END,
    cards.rarity,
    cards.language,
    top_cards.variant,
    top_cards.price,
    top_cards.currency,
    top_cards.snapshot_date,
    COALESCE(cards.updated_at, top_cards.recorded_at)
  FROM top_cards
  JOIN public.tcgdex_cards AS cards
    ON cards.card_key = top_cards.card_key
  LEFT JOIN public.tcgdex_sets AS sets
    ON sets.language = cards.language
   AND sets.id = cards.set_id
  LEFT JOIN public.tcgdex_series AS series
    ON series.language = sets.language
   AND series.id = sets.series_id
  ORDER BY top_cards.price DESC, top_cards.card_key;
$$;

REVOKE ALL ON FUNCTION public.get_current_cardmarket_top(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_cardmarket_top(TEXT, INTEGER)
  TO anon, authenticated, service_role;
