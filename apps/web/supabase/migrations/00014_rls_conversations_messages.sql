ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Conversations: participants only
CREATE POLICY "conversations_select_participant" ON conversations
  FOR SELECT USING (
    (SELECT auth.uid()) IN (buyer_id, seller_id)
  );

CREATE POLICY "conversations_insert_participant" ON conversations
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) IN (buyer_id, seller_id)
  );

-- Messages: participants of the conversation
CREATE POLICY "messages_select_participant" ON messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE buyer_id = (SELECT auth.uid())
         OR seller_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "messages_insert_participant" ON messages
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = sender_id
    AND conversation_id IN (
      SELECT id FROM conversations
      WHERE buyer_id = (SELECT auth.uid())
         OR seller_id = (SELECT auth.uid())
    )
  );

-- Messages: participants can update (for read_at marking)
CREATE POLICY "messages_update_participant" ON messages
  FOR UPDATE USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE buyer_id = (SELECT auth.uid())
         OR seller_id = (SELECT auth.uid())
    )
  );
