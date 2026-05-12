CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  seller_id UUID NOT NULL REFERENCES profiles(id),
  total_amount NUMERIC(10,2) NOT NULL,
  fee_amount NUMERIC(10,2) NOT NULL,
  shipping_cost NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'PENDING_PAYMENT' CHECK (status IN (
    'PENDING_PAYMENT','PAID','CANCELLED','EXPIRED','REFUNDED',
    'SHIPPED','COMPLETED','DISPUTED'
  )),
  stripe_checkout_session_id TEXT,
  expiration_date TIMESTAMPTZ DEFAULT now() + INTERVAL '30 minutes',
  listing_title TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  shipped_at TIMESTAMPTZ,
  shipping_address_line TEXT,
  shipping_address_city TEXT,
  shipping_address_postcode TEXT,
  shipping_country CHAR(2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
