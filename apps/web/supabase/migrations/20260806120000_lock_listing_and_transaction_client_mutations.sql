-- Lock marketplace lifecycle fields against direct PostgREST mutation.
--
-- Authenticated sellers/buyers currently have broad UPDATE RLS on listings and
-- transactions. The status-transition trigger only allow-lists a few paths and
-- otherwise falls through, so a client can:
--   1. Relist a SOLD/LOCKED card (listings.status → ACTIVE) and sell it again
--   2. Forge PENDING_PAYMENT → PAID so a seller ships without Stripe settlement
--   3. Rewrite amounts / Stripe ids / parties on their own transactions
--
-- Legitimate app clients never mutate these fields directly:
--   • listing status / reservation → service_role (checkout, offers, webhooks)
--   • transaction status → ship_order / create_dispute / release_escrow RPCs
--     (or service_role for payment finalization / refunds / expiry)
-- Metadata edits on ACTIVE listings (title, price, images) remain allowed.

CREATE OR REPLACE FUNCTION private.guard_listing_lifecycle_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- service_role / backend: auth.uid() is NULL
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.reserved_for IS DISTINCT FROM OLD.reserved_for
     OR NEW.reserved_price IS DISTINCT FROM OLD.reserved_price THEN
    RAISE EXCEPTION
      'FORBIDDEN: listing availability fields are backend-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_lifecycle_immutable_for_users ON public.listings;

CREATE TRIGGER listings_lifecycle_immutable_for_users
  BEFORE UPDATE OF status, reserved_for, reserved_price ON public.listings
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.reserved_for IS DISTINCT FROM NEW.reserved_for
    OR OLD.reserved_price IS DISTINCT FROM NEW.reserved_price
  )
  EXECUTE FUNCTION private.guard_listing_lifecycle_fields();

CREATE OR REPLACE FUNCTION public.guard_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid;
  caller_is_admin boolean := false;
BEGIN
  caller_id := auth.uid();

  -- service_role: auth.uid() is NULL → unrestricted (webhooks, admin client)
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (role = 'admin') INTO caller_is_admin
  FROM public.profiles
  WHERE id = caller_id;

  IF caller_is_admin IS TRUE THEN
    RETURN NEW;
  END IF;

  -- PAID → SHIPPED: only the seller (ship_order RPC / legacy direct update)
  IF NEW.status = 'SHIPPED' AND OLD.status = 'PAID' THEN
    IF caller_id IS DISTINCT FROM NEW.seller_id THEN
      RAISE EXCEPTION 'Unauthorized: only the seller can mark a transaction as shipped'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- SHIPPED → COMPLETED: only the buyer (release_escrow_funds)
  IF NEW.status = 'COMPLETED' AND OLD.status = 'SHIPPED' THEN
    IF caller_id IS DISTINCT FROM NEW.buyer_id THEN
      RAISE EXCEPTION 'Unauthorized: only the buyer can confirm reception'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- SHIPPED → DISPUTED: only the buyer (create_dispute RPC)
  IF NEW.status = 'DISPUTED' AND OLD.status = 'SHIPPED' THEN
    IF caller_id IS DISTINCT FROM NEW.buyer_id THEN
      RAISE EXCEPTION 'Unauthorized: only the buyer can open a dispute'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Deny-by-default: block forged payment, refund, cancel, and skip-ahead paths
  RAISE EXCEPTION
    'FORBIDDEN: invalid transaction status transition % → %',
    OLD.status, NEW.status
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_transaction_financial_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid;
  caller_is_admin boolean := false;
BEGIN
  caller_id := auth.uid();

  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (role = 'admin') INTO caller_is_admin
  FROM public.profiles
  WHERE id = caller_id;

  IF caller_is_admin IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.fee_amount IS DISTINCT FROM OLD.fee_amount
     OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost
     OR NEW.stripe_checkout_session_id IS DISTINCT FROM OLD.stripe_checkout_session_id
     OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
     OR NEW.stripe_charge_id IS DISTINCT FROM OLD.stripe_charge_id
     OR NEW.expiration_date IS DISTINCT FROM OLD.expiration_date
     OR NEW.listing_title IS DISTINCT FROM OLD.listing_title
     OR NEW.refunded_amount IS DISTINCT FROM OLD.refunded_amount
     OR NEW.refunded_at IS DISTINCT FROM OLD.refunded_at
     OR NEW.refunded_amount_minor IS DISTINCT FROM OLD.refunded_amount_minor
     OR NEW.seller_refund_target_minor IS DISTINCT FROM OLD.seller_refund_target_minor
     OR NEW.seller_refunded_minor IS DISTINCT FROM OLD.seller_refunded_minor THEN
    RAISE EXCEPTION
      'FORBIDDEN: transaction financial fields are backend-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_financial_immutable_for_users
  ON public.transactions;

CREATE TRIGGER transactions_financial_immutable_for_users
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_transaction_financial_fields();

REVOKE ALL ON FUNCTION private.guard_listing_lifecycle_fields()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.guard_transaction_financial_fields()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.guard_listing_lifecycle_fields()
  TO service_role;

GRANT EXECUTE ON FUNCTION private.guard_transaction_financial_fields()
  TO service_role;
