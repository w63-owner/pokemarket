-- =====================================================================
-- Fix #1: Restrict messages UPDATE policy to read receipts only
-- Previously any conversation participant could overwrite any column
-- on any message. Now only the *recipient* can set read_at, and only
-- on messages they did NOT send.
-- =====================================================================

DROP POLICY IF EXISTS "messages_update_participant" ON messages;

CREATE POLICY "messages_mark_read" ON messages
  FOR UPDATE USING (
    sender_id != (SELECT auth.uid())
    AND read_at IS NULL
    AND conversation_id IN (
      SELECT id FROM conversations
      WHERE buyer_id = (SELECT auth.uid())
         OR seller_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    sender_id != (SELECT auth.uid())
  );

-- =====================================================================
-- Fix #2: Sync message_type CHECK with all types used in the app
-- Adds: payment_completed, offer_cancelled_by_buyer, sale_completed
-- that were missing from previous migrations.
-- =====================================================================

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN (
    'text', 'offer', 'system', 'image',
    'offer_accepted', 'offer_rejected', 'offer_cancelled',
    'offer_cancelled_by_buyer',
    'payment_completed', 'order_shipped', 'sale_completed',
    'dispute_opened'
  ));
