-- 00058: Harden wallet payout accounting, escrow release, and Expo token ownership.
--
-- Fixes three critical invariants:
--   1. A physical Expo push token belongs to exactly one user at a time.
--   2. Escrow release moves the seller wallet before marking the order COMPLETED.
--   3. Failed pre-transfer payout attempts restore wallet balance atomically.

-- A shared device can keep an old user's token if logout cleanup fails offline.
-- Keep the most recently updated owner for each token, then enforce global
-- token uniqueness so the next registration transfers ownership to the current
-- signed-in user instead of duplicating delivery targets.
WITH ranked_tokens AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY token
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM public.expo_push_tokens
)
DELETE FROM public.expo_push_tokens e
USING ranked_tokens r
WHERE e.id = r.id
  AND r.rn > 1;

ALTER TABLE public.expo_push_tokens
  DROP CONSTRAINT IF EXISTS expo_push_tokens_user_id_token_key;

ALTER TABLE public.expo_push_tokens
  ADD CONSTRAINT expo_push_tokens_token_key UNIQUE (token);

-- Atomic wallet restore helper used when Stripe rejects the platform transfer
-- before funds leave PokeMarket. Adding the amount is safer than writing a
-- stale snapshot because new seller earnings may have arrived meanwhile.
CREATE OR REPLACE FUNCTION public.add_wallet_available_balance(
  p_user_id UUID,
  p_amount  NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount must be positive (got %)', p_amount
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.wallets
     SET available_balance = ROUND(COALESCE(available_balance, 0) + ROUND(p_amount, 2), 2)
   WHERE user_id = p_user_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'NOT_FOUND: wallet for user % does not exist', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.add_wallet_available_balance(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_wallet_available_balance(UUID, NUMERIC) TO service_role;

-- Direct buyer updates from SHIPPED -> COMPLETED used to bypass escrow release.
-- Require the transaction-local marker set by release_escrow_funds for regular
-- authenticated buyers; service_role/admin remain unrestricted for operational
-- tooling and dispute resolution.
CREATE OR REPLACE FUNCTION public.guard_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id        UUID;
  caller_is_admin BOOLEAN := FALSE;
BEGIN
  caller_id := auth.uid();

  -- service_role: auth.uid() is NULL -> unrestricted (webhooks, admin client)
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

  -- PAID -> SHIPPED: only the seller can mark a package as shipped
  IF NEW.status = 'SHIPPED' AND OLD.status = 'PAID' THEN
    IF caller_id IS DISTINCT FROM NEW.seller_id THEN
      RAISE EXCEPTION 'Unauthorized: only the seller can mark a transaction as shipped'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- SHIPPED -> COMPLETED must go through release_escrow_funds so wallet movement
  -- and status closure are atomic.
  IF NEW.status = 'COMPLETED' AND OLD.status = 'SHIPPED' THEN
    IF current_setting('app.release_escrow_funds', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'INVALID_STATUS: use release_escrow_funds to complete shipped transactions'
        USING ERRCODE = 'P0001';
    END IF;

    IF caller_id IS DISTINCT FROM NEW.buyer_id THEN
      RAISE EXCEPTION 'Unauthorized: only the buyer can confirm reception'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- SHIPPED -> DISPUTED: only the buyer can open a dispute
  IF NEW.status = 'DISPUTED' AND OLD.status = 'SHIPPED' THEN
    IF caller_id IS DISTINCT FROM NEW.buyer_id THEN
      RAISE EXCEPTION 'Unauthorized: only the buyer can open a dispute'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Replace escrow release with wallet-first semantics. Seller net is
-- total_amount - fee_amount: shipping is included in total_amount and is passed
-- through to the seller, so subtracting shipping again silently underpays.
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

  PERFORM set_config('app.release_escrow_funds', 'on', true);

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
