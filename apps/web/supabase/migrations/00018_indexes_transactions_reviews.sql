-- Transactions by buyer
CREATE INDEX idx_transactions_buyer
  ON transactions (buyer_id, created_at DESC);

-- Transactions by seller
CREATE INDEX idx_transactions_seller
  ON transactions (seller_id, created_at DESC);

-- Expired pending transactions (for cron)
CREATE INDEX idx_transactions_pending_expiration
  ON transactions (expiration_date)
  WHERE status = 'PENDING_PAYMENT';

-- Reviews by reviewee (avg rating calculation)
CREATE INDEX idx_reviews_reviewee
  ON reviews (reviewee_id, rating);
