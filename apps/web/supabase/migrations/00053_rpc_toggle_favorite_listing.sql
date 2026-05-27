-- 00053: Atomic favorite toggle RPC
--
-- Replaces the 3-RTT mobile pattern (auth.getUser → SELECT existing →
-- DELETE-or-INSERT) with a single round-trip server-side function. The
-- web app keeps using the multi-step path because it can also benefit
-- from this RPC; we'll migrate it in a follow-up.
--
-- Returns:
--   true  → listing is now favorited (insert happened)
--   false → listing was un-favorited (delete happened)
--
-- Auth: SECURITY INVOKER intentionally — the function relies on the
-- existing `favorite_listings` RLS policies (owner-only INSERT/DELETE,
-- enforced by 00015_rls_favorites_misc.sql) so a missing or invalid
-- session simply gets the standard PostgREST permission error.
-- We additionally guard with `auth.uid() IS NOT NULL` to fail fast on
-- anonymous callers with a clean error code instead of an RLS denial.

CREATE OR REPLACE FUNCTION public.toggle_favorite_listing(
  p_listing_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_exists    BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: auth.uid() is null'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the existing row (if any) to serialize concurrent toggles from
  -- the same user (e.g. double-tap). Without FOR UPDATE two parallel
  -- callers could both see "no row", both INSERT, and one would fail on
  -- the PK — annoying for the UI.
  SELECT TRUE
    INTO v_exists
    FROM public.favorite_listings
   WHERE user_id    = v_caller_id
     AND listing_id = p_listing_id
     FOR UPDATE;

  IF v_exists THEN
    DELETE FROM public.favorite_listings
     WHERE user_id    = v_caller_id
       AND listing_id = p_listing_id;
    RETURN FALSE;
  END IF;

  INSERT INTO public.favorite_listings (user_id, listing_id)
  VALUES (v_caller_id, p_listing_id)
  ON CONFLICT (user_id, listing_id) DO NOTHING;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_favorite_listing(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_favorite_listing(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_favorite_listing(UUID) TO service_role;
