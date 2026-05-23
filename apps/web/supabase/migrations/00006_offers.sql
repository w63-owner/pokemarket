CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  offer_amount NUMERIC(10,2) NOT NULL CHECK (offer_amount > 0),
  status TEXT DEFAULT 'PENDING' CHECK (status IN (
    'PENDING','ACCEPTED','REJECTED','EXPIRED','CANCELLED'
  )),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '24 hours',
  conversation_id UUID REFERENCES conversations(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add FK from messages to offers (deferred to avoid circular dependency)
ALTER TABLE messages
  ADD CONSTRAINT messages_offer_id_fkey
  FOREIGN KEY (offer_id) REFERENCES offers(id);
