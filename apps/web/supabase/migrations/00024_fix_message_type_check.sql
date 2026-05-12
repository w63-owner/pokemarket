-- Widen message_type CHECK to support offer lifecycle message types
ALTER TABLE messages DROP CONSTRAINT messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN (
    'text','offer','system','image',
    'offer_accepted','offer_rejected','offer_cancelled'
  ));

-- Seller must be able to update offers (accept/reject)
CREATE POLICY "offers_update_seller" ON offers
  FOR UPDATE USING (
    (SELECT auth.uid()) IN (
      SELECT seller_id FROM listings WHERE id = offers.listing_id
    )
  );
