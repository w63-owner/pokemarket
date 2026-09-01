-- 00053: Harden profile updates and escrow completion
--
-- Fixes two RLS gaps:
--   1. A permissive profile UPDATE policy used USING (true), which allowed any
--      authenticated user to update any profile row as long as the resulting
--      role check passed.
--   2. Buyers could directly PATCH transactions from SHIPPED to COMPLETED,
--      bypassing release_escrow_funds and leaving seller funds in pending_balance.

-- Profiles: users may update only their own profile and cannot change role.
DROP POLICY IF EXISTS "Users cannot change their own role" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "profiles_update_admin"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.profiles AS requester
       WHERE requester.id = (SELECT auth.uid())
         AND requester.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.profiles AS requester
       WHERE requester.id = (SELECT auth.uid())
         AND requester.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.guard_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  caller_id UUID;
  caller_is_admin BOOLEAN := FALSE;
BEGIN
  caller_id := auth.uid();

  -- service_role/admin maintenance can manage roles; regular users cannot.
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (role = 'admin') INTO caller_is_admin
    FROM public.profiles
   WHERE id = caller_id;

  IF caller_is_admin IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Unauthorized: profile role cannot be changed by this user'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_role_update_guard ON public.profiles;

CREATE TRIGGER profiles_role_update_guard
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.guard_profile_role_update();

-- Transactions: only the escrow RPC may complete buyer confirmations.
CREATE OR REPLACE FUNCTION public.guard_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id UUID;
  caller_is_admin BOOLEAN := FALSE;
  escrow_release_transaction_id TEXT;
BEGIN
  caller_id := auth.uid();

  -- service_role: auth.uid() is NULL, so webhooks/admin clients are unrestricted.
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (role = 'admin') INTO caller_is_admin
    FROM public.profiles
   WHERE id = caller_id;

  IF caller_is_admin IS TRUE THEN
    RETURN NEW;
  END IF;

  -- PAID to SHIPPED: only the seller can mark a package as shipped.
  IF NEW.status = 'SHIPPED' AND OLD.status = 'PAID' THEN
    IF caller_id IS DISTINCT FROM NEW.seller_id THEN
      RAISE EXCEPTION 'Unauthorized: only the seller can mark a transaction as shipped'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- SHIPPED to COMPLETED must go through release_escrow_funds so status and
  -- wallet balance movement stay atomic. Direct PostgREST UPDATEs cannot set
  -- this transaction-local marker.
  IF NEW.status = 'COMPLETED' AND OLD.status = 'SHIPPED' THEN
    IF caller_id IS DISTINCT FROM NEW.buyer_id THEN
      RAISE EXCEPTION 'Unauthorized: only the buyer can confirm reception'
        USING ERRCODE = '42501';
    END IF;

    escrow_release_transaction_id :=
      current_setting('pokemarket.release_escrow_transaction_id', true);

    IF escrow_release_transaction_id IS DISTINCT FROM NEW.id::TEXT THEN
      RAISE EXCEPTION 'Invalid transition: use release_escrow_funds to complete shipped transactions'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- SHIPPED to DISPUTED: only the buyer can open a dispute.
  IF NEW.status = 'DISPUTED' AND OLD.status = 'SHIPPED' THEN
    IF caller_id IS DISTINCT FROM NEW.buyer_id THEN
      RAISE EXCEPTION 'Unauthorized: only the buyer can open a dispute'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_escrow_funds(
  p_transaction_id UUID,
  p_buyer_id       UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id   UUID;
  v_is_admin    BOOLEAN := FALSE;
  v_tx          RECORD;
  v_seller_net  NUMERIC(10,2);
  v_rows_wallet INTEGER;
BEGIN
  -- auth.uid() is NULL for service_role clients and is allowed. Regular JWTs
  -- must either be the buyer themselves or have role = 'admin'.
  v_caller_id := auth.uid();

  IF v_caller_id IS NOT NULL THEN
    SELECT (role = 'admin')
      INTO v_is_admin
      FROM public.profiles
     WHERE id = v_caller_id;

    IF NOT COALESCE(v_is_admin, FALSE) AND v_caller_id != p_buyer_id THEN
      RAISE EXCEPTION 'FORBIDDEN: caller % is not the buyer (%) or an admin',
        v_caller_id, p_buyer_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT *
    INTO v_tx
    FROM public.transactions
   WHERE id = p_transaction_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: transaction % does not exist', p_transaction_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT COALESCE(v_is_admin, FALSE) AND v_caller_id IS NOT NULL
     AND v_tx.buyer_id != p_buyer_id THEN
    RAISE EXCEPTION 'FORBIDDEN: transaction % does not belong to buyer %',
      p_transaction_id, p_buyer_id
      USING ERRCODE = '42501';
  END IF;

  IF v_tx.status != 'SHIPPED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: expected SHIPPED but got % for transaction %',
      v_tx.status, p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  v_seller_net := ROUND(
    COALESCE(v_tx.total_amount, 0::NUMERIC)
    - COALESCE(v_tx.fee_amount, 0::NUMERIC)
    - COALESCE(v_tx.shipping_cost, 0::NUMERIC),
    2
  );

  IF v_seller_net <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: seller_net is % (must be > 0) for transaction %',
      v_seller_net, p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Mark this transaction as being completed by the escrow RPC. The status
  -- guard checks the marker and rejects direct buyer PATCH requests.
  PERFORM set_config(
    'pokemarket.release_escrow_transaction_id',
    p_transaction_id::TEXT,
    true
  );

  UPDATE public.transactions
     SET status = 'COMPLETED'
   WHERE id = p_transaction_id;

  UPDATE public.wallets
     SET pending_balance   = ROUND(pending_balance   - v_seller_net, 2),
         available_balance = ROUND(available_balance + v_seller_net, 2)
   WHERE user_id           = v_tx.seller_id
     AND pending_balance  >= v_seller_net;

  GET DIAGNOSTICS v_rows_wallet = ROW_COUNT;

  IF v_rows_wallet = 0 THEN
    RAISE WARNING
      'ESCROW_BALANCE_MISMATCH: seller % wallet has insufficient pending_balance '
      'for transaction % (seller_net = %). Manual reconciliation required.',
      v_tx.seller_id, p_transaction_id, v_seller_net;
  END IF;

  RETURN TRUE;

EXCEPTION
  WHEN SQLSTATE '42501' OR SQLSTATE 'P0001' OR SQLSTATE 'P0002' THEN
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.release_escrow_funds(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(UUID, UUID) TO service_role;
