-- 00058: Harden wallet/transaction security guards
--
-- Fixes three money/security invariants:
--   1. Escrow release must move the full seller credit (total - fee, including
--      shipping) and must fail before marking a transaction COMPLETED when the
--      wallet move cannot be applied.
--   2. Clients must not be able to update transaction rows directly; shipped,
--      dispute, and completion transitions go through audited RPCs.
--   3. Authenticated users must not be able to promote their own profile role.

-- ---------------------------------------------------------------------------
-- Profiles: keep normal self-updates, but block role changes unless the caller
-- is service_role (auth.uid() is NULL) or was already an admin before UPDATE.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "Users cannot change their own role" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
        FROM public.profiles admin_profile
       WHERE admin_profile.id = (SELECT auth.uid())
         AND admin_profile.role = 'admin'
    )
  )
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.guard_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_admin BOOLEAN := FALSE;
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- service_role/admin-client maintenance paths have auth.uid() = NULL.
  IF v_caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (role = 'admin')
    INTO v_caller_is_admin
    FROM public.profiles
   WHERE id = v_caller_id;

  IF v_caller_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN: users cannot change their own role'
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

-- ---------------------------------------------------------------------------
-- Transactions: remove broad client UPDATE policies. State transitions that
-- mutate financial/order state are exposed through RPCs with explicit checks.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "transactions_update_buyer" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update_seller" ON public.transactions;

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

  -- finalizePaidTransaction credits pending_balance with card net + shipping:
  -- total_amount - fee_amount. Release the same amount to available_balance.
  v_seller_net := ROUND(
    COALESCE(v_tx.total_amount, 0::NUMERIC)
    - COALESCE(v_tx.fee_amount, 0::NUMERIC),
    2
  );

  IF v_seller_net <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: seller_net is % (must be > 0) for transaction %',
      v_seller_net, p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.wallets
     SET pending_balance   = ROUND(pending_balance   - v_seller_net, 2),
         available_balance = ROUND(available_balance + v_seller_net, 2)
   WHERE user_id           = v_tx.seller_id
     AND pending_balance  >= v_seller_net;

  GET DIAGNOSTICS v_rows_wallet = ROW_COUNT;

  IF v_rows_wallet = 0 THEN
    RAISE EXCEPTION
      'ESCROW_BALANCE_MISMATCH: seller % wallet has insufficient pending_balance for transaction % (seller_net = %)',
      v_tx.seller_id, p_transaction_id, v_seller_net
      USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.transactions
     SET status = 'COMPLETED'
   WHERE id = p_transaction_id;

  RETURN TRUE;

EXCEPTION
  WHEN SQLSTATE '42501' OR SQLSTATE 'P0001' OR SQLSTATE 'P0002' OR SQLSTATE 'P0004' THEN
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.release_escrow_funds(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.ship_order(
  p_transaction_id   UUID,
  p_tracking_number  TEXT,
  p_tracking_url     TEXT,
  p_conversation_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_seller_id UUID;
  v_status    TEXT;
  v_now       TIMESTAMPTZ := now();
  v_metadata  JSONB;
BEGIN
  IF p_tracking_number IS NULL OR length(trim(p_tracking_number)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: tracking_number is required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT seller_id, status
    INTO v_seller_id, v_status
    FROM public.transactions
   WHERE id = p_transaction_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: transaction % does not exist', p_transaction_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_caller_id IS NOT NULL AND v_caller_id != v_seller_id THEN
    RAISE EXCEPTION 'FORBIDDEN: only the seller can ship the order'
      USING ERRCODE = '42501';
  END IF;

  IF v_status != 'PAID' THEN
    RAISE EXCEPTION 'INVALID_STATUS: expected PAID but got % for transaction %',
      v_status, p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.transactions
     SET status           = 'SHIPPED',
         tracking_number  = p_tracking_number,
         tracking_url     = p_tracking_url,
         shipped_at       = v_now
   WHERE id = p_transaction_id;

  v_metadata := jsonb_build_object(
    'tracking_number', p_tracking_number,
    'shipped_at',      v_now
  );

  IF p_tracking_url IS NOT NULL AND length(p_tracking_url) > 0 THEN
    v_metadata := v_metadata || jsonb_build_object('tracking_url', p_tracking_url);
  END IF;

  INSERT INTO public.messages (
    conversation_id, sender_id, content, message_type, metadata
  )
  VALUES (
    p_conversation_id,
    COALESCE(v_caller_id, v_seller_id),
    'Colis expédié',
    'order_shipped',
    v_metadata
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ship_order(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ship_order(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ship_order(UUID, TEXT, TEXT, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.create_dispute(
  p_transaction_id   UUID,
  p_reason           TEXT,
  p_description      TEXT,
  p_conversation_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id    UUID := auth.uid();
  v_buyer_id     UUID;
  v_status       TEXT;
  v_trimmed      TEXT;
  v_reason_upper TEXT;
BEGIN
  v_trimmed := trim(COALESCE(p_description, ''));

  IF length(v_trimmed) < 10 THEN
    RAISE EXCEPTION 'INVALID_INPUT: description must be at least 10 chars'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_reason NOT IN ('damaged_card', 'wrong_card', 'empty_package', 'other') THEN
    RAISE EXCEPTION 'INVALID_INPUT: unknown dispute reason %', p_reason
      USING ERRCODE = 'P0001';
  END IF;

  v_reason_upper := upper(p_reason);

  SELECT buyer_id, status
    INTO v_buyer_id, v_status
    FROM public.transactions
   WHERE id = p_transaction_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: transaction % does not exist', p_transaction_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_caller_id IS NOT NULL AND v_caller_id != v_buyer_id THEN
    RAISE EXCEPTION 'FORBIDDEN: only the buyer can open a dispute'
      USING ERRCODE = '42501';
  END IF;

  IF v_status != 'SHIPPED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: expected SHIPPED but got % for transaction %',
      v_status, p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.disputes (transaction_id, opened_by, reason, description)
  VALUES (
    p_transaction_id,
    COALESCE(v_caller_id, v_buyer_id),
    v_reason_upper,
    v_trimmed
  );

  UPDATE public.transactions
     SET status = 'DISPUTED'
   WHERE id = p_transaction_id;

  INSERT INTO public.messages (
    conversation_id, sender_id, content, message_type, metadata
  )
  VALUES (
    p_conversation_id,
    COALESCE(v_caller_id, v_buyer_id),
    'Litige ouvert',
    'dispute_opened',
    jsonb_build_object('reason', p_reason, 'description', v_trimmed)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_dispute(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_dispute(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_dispute(UUID, TEXT, TEXT, UUID) TO service_role;
