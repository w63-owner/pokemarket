-- Conversations by participant
CREATE INDEX idx_conversations_buyer ON conversations (buyer_id);
CREATE INDEX idx_conversations_seller ON conversations (seller_id);

-- Messages: keyset pagination within conversation
CREATE INDEX idx_messages_conversation_created
  ON messages (conversation_id, created_at DESC, id);

-- Unread messages
CREATE INDEX idx_messages_unread
  ON messages (conversation_id, sender_id, read_at)
  WHERE read_at IS NULL;

-- Offers by listing
CREATE INDEX idx_offers_listing_status
  ON offers (listing_id, status);

-- Offers by buyer (daily limit check)
CREATE INDEX idx_offers_buyer_daily
  ON offers (buyer_id, created_at);
