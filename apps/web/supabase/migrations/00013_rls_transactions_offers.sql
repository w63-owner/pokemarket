ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

-- Transactions: participants can read
CREATE POLICY "transactions_select_participant" ON transactions
  FOR SELECT USING (
    (SELECT auth.uid()) IN (buyer_id, seller_id)
  );

-- Seller can update for shipping info
CREATE POLICY "transactions_update_seller" ON transactions
  FOR UPDATE USING ((SELECT auth.uid()) = seller_id);

-- Offers: buyer and seller can read
CREATE POLICY "offers_select_participant" ON offers
  FOR SELECT USING (
    (SELECT auth.uid()) = buyer_id
    OR (SELECT auth.uid()) IN (
      SELECT seller_id FROM listings WHERE id = offers.listing_id
    )
  );

-- Only buyer can create offers
CREATE POLICY "offers_insert_buyer" ON offers
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = buyer_id);

-- Buyer can update own offers (cancel)
CREATE POLICY "offers_update_buyer" ON offers
  FOR UPDATE USING ((SELECT auth.uid()) = buyer_id);
