-- Migration: Exhaustive TCGdex v2 catalog
-- Adds all missing fields from the TCGdex API v2 to tcgdex_sets and tcgdex_cards.
-- This is a non-destructive, additive migration (ALTER TABLE ADD COLUMN only).

-- ═══════════════════════════════════════════════════════════
-- tcgdex_sets — new columns
-- ═══════════════════════════════════════════════════════════

ALTER TABLE tcgdex_sets ADD COLUMN symbol TEXT;
ALTER TABLE tcgdex_sets ADD COLUMN card_count JSONB;
ALTER TABLE tcgdex_sets ADD COLUMN legal JSONB;
ALTER TABLE tcgdex_sets ADD COLUMN tcg_online_code TEXT;

COMMENT ON COLUMN tcgdex_sets.symbol IS
  'URL of the set symbol asset (format-agnostic, append .webp/.png/.jpg)';
COMMENT ON COLUMN tcgdex_sets.card_count IS
  '{total: number, official: number, reverse?: number, holo?: number, firstEd?: number, normal?: number}';
COMMENT ON COLUMN tcgdex_sets.legal IS
  '{standard: boolean, expanded: boolean}';
COMMENT ON COLUMN tcgdex_sets.tcg_online_code IS
  'Pokémon TCG Online set code';

-- ═══════════════════════════════════════════════════════════
-- tcgdex_cards — new scalar columns (Pokemon)
-- ═══════════════════════════════════════════════════════════

ALTER TABLE tcgdex_cards ADD COLUMN local_id TEXT;
ALTER TABLE tcgdex_cards ADD COLUMN category TEXT;
ALTER TABLE tcgdex_cards ADD COLUMN illustrator TEXT;
ALTER TABLE tcgdex_cards ADD COLUMN image TEXT;
ALTER TABLE tcgdex_cards ADD COLUMN evolve_from TEXT;
ALTER TABLE tcgdex_cards ADD COLUMN description TEXT;
ALTER TABLE tcgdex_cards ADD COLUMN stage TEXT;
ALTER TABLE tcgdex_cards ADD COLUMN retreat INTEGER;
ALTER TABLE tcgdex_cards ADD COLUMN regulation_mark TEXT;
ALTER TABLE tcgdex_cards ADD COLUMN level TEXT;
ALTER TABLE tcgdex_cards ADD COLUMN suffix TEXT;

-- ═══════════════════════════════════════════════════════════
-- tcgdex_cards — new scalar columns (Trainer / Energy)
-- ═══════════════════════════════════════════════════════════

ALTER TABLE tcgdex_cards ADD COLUMN effect TEXT;
ALTER TABLE tcgdex_cards ADD COLUMN trainer_type TEXT;
ALTER TABLE tcgdex_cards ADD COLUMN energy_type TEXT;

-- ═══════════════════════════════════════════════════════════
-- tcgdex_cards — new JSONB columns
-- ═══════════════════════════════════════════════════════════

ALTER TABLE tcgdex_cards ADD COLUMN types JSONB;
ALTER TABLE tcgdex_cards ADD COLUMN attacks JSONB;
ALTER TABLE tcgdex_cards ADD COLUMN weaknesses JSONB;
ALTER TABLE tcgdex_cards ADD COLUMN legal JSONB;
ALTER TABLE tcgdex_cards ADD COLUMN dex_id JSONB;
ALTER TABLE tcgdex_cards ADD COLUMN item JSONB;
ALTER TABLE tcgdex_cards ADD COLUMN pricing JSONB;

-- ═══════════════════════════════════════════════════════════
-- tcgdex_cards — new timestamp column
-- ═══════════════════════════════════════════════════════════

ALTER TABLE tcgdex_cards ADD COLUMN updated_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════
-- JSONB column documentation
-- ═══════════════════════════════════════════════════════════

COMMENT ON COLUMN tcgdex_cards.local_id IS
  'Card number within its set (string, may be non-numeric e.g. "SV001")';
COMMENT ON COLUMN tcgdex_cards.category IS
  'Card category: "Pokemon", "Trainer", or "Energy"';
COMMENT ON COLUMN tcgdex_cards.image IS
  'Base image URL from TCGdex (append /low.webp, /high.webp, etc.)';
COMMENT ON COLUMN tcgdex_cards.variants IS
  '{normal: bool, reverse: bool, holo: bool, firstEdition: bool, wPromo?: bool}';
COMMENT ON COLUMN tcgdex_cards.types IS
  'Array of Pokemon type strings, e.g. ["Fire", "Water"]';
COMMENT ON COLUMN tcgdex_cards.attacks IS
  'Array of {cost: string[], name: string, effect?: string, damage?: string|number}';
COMMENT ON COLUMN tcgdex_cards.weaknesses IS
  'Array of {type: string, value: string}';
COMMENT ON COLUMN tcgdex_cards.legal IS
  '{standard: boolean, expanded: boolean}';
COMMENT ON COLUMN tcgdex_cards.dex_id IS
  'Array of National Pokedex IDs, e.g. [162]';
COMMENT ON COLUMN tcgdex_cards.item IS
  '{name: string, effect: string} — held item for certain Pokemon cards';
COMMENT ON COLUMN tcgdex_cards.pricing IS
  '{cardmarket?: {updated, unit, avg, low, trend, ...}, tcgplayer?: {updated, unit, normal?: {...}, reverse?: {...}, ...}}';

-- ═══════════════════════════════════════════════════════════
-- Performance indexes for the new columns
-- ═══════════════════════════════════════════════════════════

CREATE INDEX idx_tcgdex_cards_types ON tcgdex_cards USING gin (types);
CREATE INDEX idx_tcgdex_cards_category ON tcgdex_cards (language, category);
CREATE INDEX idx_tcgdex_cards_set_id ON tcgdex_cards (language, set_id);
CREATE INDEX idx_tcgdex_cards_name_trgm ON tcgdex_cards USING gin (name gin_trgm_ops);
