-- card_key is derived from PK (language || '-' || id) but needs an explicit
-- UNIQUE constraint to be used as a FK target.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tcgdex_cards_card_key
  ON tcgdex_cards (card_key);

CREATE TABLE card_price_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_key    TEXT NOT NULL REFERENCES tcgdex_cards(card_key),
  price       NUMERIC NOT NULL,
  condition   TEXT NOT NULL,
  language    TEXT NOT NULL,
  is_graded   BOOLEAN NOT NULL DEFAULT FALSE,
  source      TEXT NOT NULL DEFAULT 'TCGDEX_SNAPSHOT',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_price_history_lookup
  ON card_price_history (card_key, condition, language, is_graded, recorded_at DESC);

ALTER TABLE card_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_price_history_select_public"
  ON card_price_history FOR SELECT USING (true);
