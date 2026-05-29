-- 00056: Prevent client-side promotion of transactions to PAID
--
-- Buyers can update their own transaction rows so they can confirm reception
-- after shipping, but direct PostgREST updates must never be able to mark an
-- unpaid order as PAID. Only service_role webhook/reconcile paths and admins
-- may perform payment confirmation.

CREATE OR REPLACE FUNCTION public.guard_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id        UUID;
  caller_is_admin  BOOLEAN := FALSE;
BEGIN
  caller_id := auth.uid();

  -- service_role: auth.uid() is NULL -> unrestricted (webhooks, admin client)
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Users with the admin role are unrestricted.
  SELECT (role = 'admin') INTO caller_is_admin
  FROM public.profiles
  WHERE id = caller_id;

  IF caller_is_admin IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Payment confirmation is only allowed from trusted server-side Stripe paths.
  IF NEW.status = 'PAID' AND OLD.status IS DISTINCT FROM 'PAID' THEN
    RAISE EXCEPTION 'Unauthorized: only trusted payment handlers can mark a transaction as paid'
      USING ERRCODE = '42501';
  END IF;

  -- PAID -> SHIPPED: only the seller can mark a package as shipped.
  IF NEW.status = 'SHIPPED' AND OLD.status = 'PAID' THEN
    IF caller_id IS DISTINCT FROM NEW.seller_id THEN
      RAISE EXCEPTION 'Unauthorized: only the seller can mark a transaction as shipped'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- SHIPPED -> COMPLETED: only the buyer can confirm reception (escrow release).
  IF NEW.status = 'COMPLETED' AND OLD.status = 'SHIPPED' THEN
    IF caller_id IS DISTINCT FROM NEW.buyer_id THEN
      RAISE EXCEPTION 'Unauthorized: only the buyer can confirm reception'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- SHIPPED -> DISPUTED: only the buyer can open a dispute.
  IF NEW.status = 'DISPUTED' AND OLD.status = 'SHIPPED' THEN
    IF caller_id IS DISTINCT FROM NEW.buyer_id THEN
      RAISE EXCEPTION 'Unauthorized: only the buyer can open a dispute'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
