-- One checkout transaction must not grow two payable Stripe objects.
--
-- Web Checkout Sessions and mobile PaymentIntents use different idempotency
-- keys. If the second client arrives after the row exists but before the
-- first Stripe id is saved, both creates succeed and the buyer can pay twice
-- for one order. checkout_attempt_client is an atomic claim for that window.
-- Service role writes it; authenticated updates cannot clear it.

ALTER TABLE public.transactions
  ADD COLUMN checkout_attempt_client text;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_checkout_attempt_client_check
  CHECK (
    checkout_attempt_client IS NULL
    OR checkout_attempt_client IN ('web', 'mobile')
  );

CREATE OR REPLACE FUNCTION private.guard_checkout_attempt_client()
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

  IF NEW.checkout_attempt_client IS DISTINCT FROM OLD.checkout_attempt_client THEN
    RAISE EXCEPTION 'FORBIDDEN: checkout attempt is backend-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_checkout_attempt_client_guard
  ON public.transactions;

CREATE TRIGGER transactions_checkout_attempt_client_guard
  BEFORE UPDATE OF checkout_attempt_client ON public.transactions
  FOR EACH ROW
  WHEN (
    OLD.checkout_attempt_client IS DISTINCT FROM NEW.checkout_attempt_client
  )
  EXECUTE FUNCTION private.guard_checkout_attempt_client();

REVOKE ALL ON FUNCTION private.guard_checkout_attempt_client()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.guard_checkout_attempt_client()
  TO service_role;
