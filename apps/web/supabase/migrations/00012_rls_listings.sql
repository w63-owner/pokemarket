ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- Public read for ACTIVE listings
CREATE POLICY "listings_select_active" ON listings
  FOR SELECT USING (status = 'ACTIVE');

-- Owner can read all their listings
CREATE POLICY "listings_select_own" ON listings
  FOR SELECT USING ((SELECT auth.uid()) = seller_id);

-- Buyer who reserved can see RESERVED/LOCKED/SOLD listings
CREATE POLICY "listings_select_reserved" ON listings
  FOR SELECT USING (
    (SELECT auth.uid()) = reserved_for
    AND status IN ('RESERVED', 'LOCKED', 'SOLD')
  );

-- Participants in a conversation for this listing can see it
CREATE POLICY "listings_select_conversation_participant" ON listings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.listing_id = listings.id
        AND (c.buyer_id = (SELECT auth.uid()) OR c.seller_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "listings_insert_own" ON listings
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = seller_id);

CREATE POLICY "listings_update_own" ON listings
  FOR UPDATE USING ((SELECT auth.uid()) = seller_id);

CREATE POLICY "listings_delete_own" ON listings
  FOR DELETE USING ((SELECT auth.uid()) = seller_id);
