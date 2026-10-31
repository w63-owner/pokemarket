-- A buyer retry can create a new PENDING_PAYMENT row while release-expired
-- is still deciding to unlock the listing. The replacement payment must
-- re-claim the lock before Stripe is created, and the cron must not free a
-- listing that already has another open checkout.

BEGIN;

CREATE OR REPLACE FUNCTION private.retain_checkout_lock(
  p_listing_id uuid,
  p_buyer_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_listing public.listings%ROWTYPE;
BEGIN
  SELECT *
    INTO v_listing
    FROM public.listings
   WHERE id = p_listing_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.transactions
     WHERE listing_id = p_listing_id
       AND status IN ('PAID', 'SHIPPED', 'COMPLETED', 'DISPUTED')
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.transactions
     WHERE listing_id = p_listing_id
       AND status = 'PENDING_PAYMENT'
       AND buyer_id IS DISTINCT FROM p_buyer_id
  ) THEN
    RETURN false;
  END IF;

  IF v_listing.status = 'LOCKED'
     AND (
       v_listing.reserved_for IS NULL
       OR v_listing.reserved_for = p_buyer_id
     ) THEN
    IF v_listing.reserved_for IS NULL THEN
      UPDATE public.listings
         SET reserved_for = p_buyer_id
       WHERE id = p_listing_id;
    END IF;
    RETURN true;
  END IF;

  IF v_listing.status = 'ACTIVE'
     AND (
       v_listing.reserved_for IS NULL
       OR v_listing.reserved_for = p_buyer_id
     ) THEN
    UPDATE public.listings
       SET status = 'LOCKED',
           reserved_for = p_buyer_id
     WHERE id = p_listing_id;
    RETURN true;
  END IF;

  IF v_listing.status = 'RESERVED'
     AND v_listing.reserved_for = p_buyer_id THEN
    UPDATE public.listings
       SET status = 'LOCKED'
     WHERE id = p_listing_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION private.retain_checkout_lock(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.retain_checkout_lock(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.retain_checkout_lock(
  p_listing_id uuid,
  p_buyer_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: checkout lock is service-only'
      USING ERRCODE = '42501';
  END IF;

  RETURN private.retain_checkout_lock(p_listing_id, p_buyer_id);
END;
$$;

REVOKE ALL ON FUNCTION public.retain_checkout_lock(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retain_checkout_lock(uuid, uuid)
  TO service_role;

COMMIT;
