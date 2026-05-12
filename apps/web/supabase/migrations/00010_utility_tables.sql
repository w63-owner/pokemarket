CREATE TABLE shipping_matrix (
  id SERIAL PRIMARY KEY,
  origin_country CHAR(2) NOT NULL,
  dest_country CHAR(2) NOT NULL,
  weight_class TEXT NOT NULL,
  price NUMERIC(6,2) NOT NULL,
  currency CHAR(3) DEFAULT 'EUR'
);

CREATE TABLE price_estimations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_name TEXT NOT NULL,
  set_name TEXT,
  estimated_price NUMERIC(10,2),
  currency CHAR(3) DEFAULT 'EUR',
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ocr_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  listing_id UUID REFERENCES listings(id),
  selected_card_ref_id TEXT,
  raw_text TEXT,
  parsed JSONB,
  candidates JSONB,
  confidence NUMERIC(5,4),
  provider TEXT DEFAULT 'openai',
  model TEXT DEFAULT 'gpt-4o',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE stripe_webhooks_processed (
  stripe_event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT now()
);
