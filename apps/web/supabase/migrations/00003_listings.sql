CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES profiles(id),
  card_ref_id TEXT,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 140),
  price_seller NUMERIC(10,2) NOT NULL CHECK (price_seller > 0),
  display_price NUMERIC(10,2) GENERATED ALWAYS AS (
    round(price_seller * 1.05 + 0.70, 2)
  ) STORED,
  condition TEXT CHECK (condition IN (
    'MINT','NEAR_MINT','EXCELLENT','GOOD','LIGHT_PLAYED','PLAYED','POOR'
  )),
  is_graded BOOLEAN DEFAULT FALSE,
  grading_company TEXT CHECK (grading_company IN (
    'PSA','PCA','BGS','CGC','SGC','ACE','OTHER'
  )),
  grade_note NUMERIC(3,1) CHECK (grade_note BETWEEN 1 AND 10),
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN (
    'DRAFT','ACTIVE','LOCKED','RESERVED','SOLD'
  )),
  delivery_weight_class TEXT DEFAULT 'S' CHECK (delivery_weight_class IN (
    'XS','S','M','L','XL'
  )),
  cover_image_url TEXT,
  back_image_url TEXT,
  reserved_for UUID REFERENCES profiles(id),
  reserved_price NUMERIC(10,2),
  card_series TEXT,
  card_block TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
