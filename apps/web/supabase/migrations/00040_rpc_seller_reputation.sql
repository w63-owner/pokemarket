CREATE OR REPLACE FUNCTION get_seller_reputation(p_seller_id UUID)
RETURNS TABLE(avg_rating NUMERIC(3,2), review_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(AVG(rating)::numeric(3,2), 0) AS avg_rating,
    COUNT(*)                                AS review_count
  FROM reviews
  WHERE reviewee_id = p_seller_id;
$$;
