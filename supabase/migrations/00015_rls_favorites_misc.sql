ALTER TABLE favorite_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcgdex_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcgdex_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcgdex_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_estimations ENABLE ROW LEVEL SECURITY;

-- Favorite listings: owner CRUD
CREATE POLICY "fav_listings_select_own" ON favorite_listings
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "fav_listings_insert_own" ON favorite_listings
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "fav_listings_delete_own" ON favorite_listings
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- Favorite sellers: owner CRUD
CREATE POLICY "fav_sellers_select_own" ON favorite_sellers
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "fav_sellers_insert_own" ON favorite_sellers
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "fav_sellers_delete_own" ON favorite_sellers
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- Saved searches: owner CRUD
CREATE POLICY "saved_searches_select_own" ON saved_searches
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "saved_searches_insert_own" ON saved_searches
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "saved_searches_delete_own" ON saved_searches
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- TCGdex catalog: public read
CREATE POLICY "tcgdex_series_select" ON tcgdex_series FOR SELECT USING (true);
CREATE POLICY "tcgdex_sets_select" ON tcgdex_sets FOR SELECT USING (true);
CREATE POLICY "tcgdex_cards_select" ON tcgdex_cards FOR SELECT USING (true);

-- Reviews: authenticated read
CREATE POLICY "reviews_select_auth" ON reviews
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Disputes: participant read
CREATE POLICY "disputes_select_participant" ON disputes
  FOR SELECT USING (
    (SELECT auth.uid()) = opened_by
    OR (SELECT auth.uid()) IN (
      SELECT buyer_id FROM transactions WHERE id = disputes.transaction_id
      UNION
      SELECT seller_id FROM transactions WHERE id = disputes.transaction_id
    )
  );

-- Push subscriptions: owner CRUD
CREATE POLICY "push_subs_select_own" ON push_subscriptions
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "push_subs_insert_own" ON push_subscriptions
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "push_subs_delete_own" ON push_subscriptions
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- Shipping matrix: public read
CREATE POLICY "shipping_matrix_select" ON shipping_matrix
  FOR SELECT USING (true);

-- Price estimations: public read
CREATE POLICY "price_estimations_select" ON price_estimations
  FOR SELECT USING (true);
