CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID UNIQUE NOT NULL REFERENCES transactions(id),
  reviewer_id UUID NOT NULL REFERENCES profiles(id),
  reviewee_id UUID NOT NULL REFERENCES profiles(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID UNIQUE NOT NULL REFERENCES transactions(id),
  opened_by UUID NOT NULL REFERENCES profiles(id),
  reason TEXT CHECK (reason IN (
    'DAMAGED_CARD','WRONG_CARD','EMPTY_PACKAGE','OTHER'
  )),
  description TEXT CHECK (char_length(description) >= 10),
  status TEXT DEFAULT 'OPEN' CHECK (status IN (
    'OPEN','IN_REVIEW','RESOLVED'
  )),
  created_at TIMESTAMPTZ DEFAULT now()
);
