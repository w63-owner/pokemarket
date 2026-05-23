CREATE TABLE tcgdex_series (
  language TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (language, id)
);

CREATE TABLE tcgdex_sets (
  language TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  series_id TEXT,
  logo TEXT,
  release_date DATE,
  PRIMARY KEY (language, id)
);

CREATE TABLE tcgdex_cards (
  language TEXT NOT NULL,
  id TEXT NOT NULL,
  card_key TEXT GENERATED ALWAYS AS (language || '-' || id) STORED,
  name TEXT,
  set_id TEXT,
  hp INTEGER,
  rarity TEXT,
  variants JSONB,
  PRIMARY KEY (language, id)
);
