-- The sales screens ship to transactions.shipping_address_* / shipping_country.
-- Buyer and seller UPDATE policies allow either participant to rewrite those
-- columns without changing status, so the status-transition trigger never runs.
-- Checkout writes the address with the service role, then Stripe charges the
-- quote for that destination. A later JWT update does not reprice shipping.
--
-- Concrete failure: a buyer pays domestic shipping, then updates the row to a
-- foreign address before the seller opens the order. The seller ships there
-- and pays the postage difference. A seller can also replace the buyer's
-- address, so the fulfillment record no longer matches what was paid for.
--
-- service_role (auth.uid() IS NULL) stays allowed for checkout and maintenance.

BEGIN;

CREATE OR REPLACE FUNCTION private.guard_transaction_shipping_address()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'FORBIDDEN: shipping address is fixed at checkout'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION private.guard_transaction_shipping_address()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS transactions_shipping_address_guard
  ON public.transactions;

CREATE TRIGGER transactions_shipping_address_guard
  BEFORE UPDATE OF
    shipping_address_line,
    shipping_address_city,
    shipping_address_postcode,
    shipping_country
  ON public.transactions
  FOR EACH ROW
  WHEN (
    OLD.shipping_address_line IS DISTINCT FROM NEW.shipping_address_line
    OR OLD.shipping_address_city IS DISTINCT FROM NEW.shipping_address_city
    OR OLD.shipping_address_postcode IS DISTINCT FROM NEW.shipping_address_postcode
    OR OLD.shipping_country IS DISTINCT FROM NEW.shipping_country
  )
  EXECUTE FUNCTION private.guard_transaction_shipping_address();

COMMIT;
