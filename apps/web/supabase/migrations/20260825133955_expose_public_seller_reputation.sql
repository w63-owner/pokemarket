CREATE OR REPLACE FUNCTION private.get_seller_reputation_summary(
  p_seller_id uuid
)
RETURNS TABLE(avg_rating numeric(3,2), review_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(AVG(reviews.rating)::numeric(3,2), 0) AS avg_rating,
    COUNT(*) AS review_count
  FROM public.reviews
  WHERE reviews.reviewee_id = p_seller_id;
$$;

REVOKE ALL ON FUNCTION private.get_seller_reputation_summary(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_seller_reputation_summary(uuid)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_seller_reputation(p_seller_id uuid)
RETURNS TABLE(avg_rating numeric(3,2), review_count bigint)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT *
  FROM private.get_seller_reputation_summary(p_seller_id);
$$;

REVOKE ALL ON FUNCTION public.get_seller_reputation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_seller_reputation(uuid)
  TO anon, authenticated;
