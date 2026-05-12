CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  seller_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT buyer_not_seller CHECK (buyer_id != seller_id),
  CONSTRAINT unique_conversation UNIQUE (listing_id, buyer_id, seller_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  sender_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT CHECK (char_length(content) BETWEEN 1 AND 2000),
  message_type TEXT DEFAULT 'text' CHECK (message_type IN (
    'text','offer','system','image'
  )),
  offer_id UUID,
  metadata JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
