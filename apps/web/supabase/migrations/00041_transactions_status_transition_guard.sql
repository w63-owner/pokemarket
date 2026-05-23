-- 00041: Server-side guard on transaction status transitions
-- Ensures that even a direct PostgREST call bypassing the app cannot
-- perform an invalid transition (e.g. seller self-completing their order).
--
-- Rules enforced:
--   PAID      → SHIPPED    : only seller_id  (or service_role / admin)
--   SHIPPED   → COMPLETED  : only buyer_id   (or service_role / admin)
--   SHIPPED   → DISPUTED   : only buyer_id   (or service_role / admin)
--
-- auth.uid() is NULL for service_role connections (webhooks, cron, Server Actions
-- using the admin client) — those are allowed to perform any transition.
-- Users with role = 'admin' in the profiles table are also unrestricted.

CREATE OR REPLACE FUNCTION public.guard_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id      UUID;
  caller_is_admin BOOLEAN := FALSE;
BEGIN
  caller_id := auth.uid();

  -- service_role: auth.uid() is NULL → unrestricted (webhooks, admin client)
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Users with the admin role are unrestricted
  SELECT (role = 'admin') INTO caller_is_admin
  FROM public.profiles
  WHERE id = caller_id;

  IF caller_is_admin IS TRUE THEN
    RETURN NEW;
  END IF;

  -- PAID → SHIPPED: only the seller can mark a package as shipped
  IF NEW.status = 'SHIPPED' AND OLD.status = 'PAID' THEN
    IF caller_id IS DISTINCT FROM NEW.seller_id THEN
      RAISE EXCEPTION 'Unauthorized: only the seller can mark a transaction as shipped'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- SHIPPED → COMPLETED: only the buyer can confirm reception (escrow release)
  IF NEW.status = 'COMPLETED' AND OLD.status = 'SHIPPED' THEN
    IF caller_id IS DISTINCT FROM NEW.buyer_id THEN
      RAISE EXCEPTION 'Unauthorized: only the buyer can confirm reception'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- SHIPPED → DISPUTED: only the buyer can open a dispute
  IF NEW.status = 'DISPUTED' AND OLD.status = 'SHIPPED' THEN
    IF caller_id IS DISTINCT FROM NEW.buyer_id THEN
      RAISE EXCEPTION 'Unauthorized: only the buyer can open a dispute'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Only fire on actual status changes to avoid overhead on other UPDATE fields
DROP TRIGGER IF EXISTS transactions_status_transition_guard ON public.transactions;

CREATE TRIGGER transactions_status_transition_guard
  BEFORE UPDATE OF status ON public.transactions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.guard_transaction_status_transition();
