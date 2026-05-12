-- 1. Allow buyer to update their own transactions (confirm reception → COMPLETED)
CREATE POLICY "transactions_update_buyer" ON transactions
  FOR UPDATE USING ((SELECT auth.uid()) = buyer_id);

-- 2. Allow transaction participants to insert reviews
CREATE POLICY "reviews_insert_participant" ON reviews
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = reviewer_id
    AND transaction_id IN (
      SELECT id FROM transactions
      WHERE buyer_id = (SELECT auth.uid())
         OR seller_id = (SELECT auth.uid())
    )
  );

-- 3. Widen message_type CHECK to include transaction lifecycle types
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN (
    'text','offer','system','image',
    'offer_accepted','offer_rejected','offer_cancelled',
    'order_shipped','sale_completed','dispute_opened'
  ));
