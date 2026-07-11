-- Harden escrow release, wallet payout recovery, and Expo push-token ownership.

-- A physical device can be shared between accounts. Expo tokens identify the
-- device/app installation, so a token must belong to exactly one current user.
WITH ranked_tokens AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY token
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM public.expo_push_tokens
)
DELETE FROM public.expo_push_tokens e
USING ranked_tokens r
WHERE e.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expo_push_tokens_token_key'
      AND conrelid = 'public.expo_push_tokens'::regclass
  ) THEN
    ALTER TABLE public.expo_push_tokens
      ADD CONSTRAINT expo_push_tokens_token_key UNIQUE (token);
  END IF;
END;
$$;

-- Additive wallet restore helper for server-side payout failures. Updating by
-- absolute value can lose funds if a new sale credits the wallet between the
-- payout reservation and Stripe rejecting the transfer.
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
  v_rows_updated INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: p_amount must be positive'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.wallets
     SET available_balance = ROUND(available_balance + p_amount, 2)
   WHERE user_id = p_user_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'NOT_FOUND: wallet for user % does not exist', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.add_wallet_available_balance(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_wallet_available_balance(UUID, NUMERIC) TO service_role;

-- Direct authenticated updates to COMPLETED bypass the escrow RPC and leave
-- seller funds stuck in pending_balance. Require release_escrow_funds to mark
-- the transaction-local setting before a SHIPPED -> COMPLETED update.
CREATE OR REPLACE FUNCTION public.guard_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id        UUID;
  caller_is_admin  BOOLEAN := FALSE;
  escrow_rpc_marker TEXT;
BEGIN
  caller_id := auth.uid();
  escrow_rpc_marker := current_setting('pokemarket.release_escrow_funds', TRUE);

  IF caller_id IS NOT NULL THEN
    SELECT (role = 'admin') INTO caller_is_admin
    FROM public.profiles
    WHERE id = caller_id;
  END IF;

  IF NEW.status = 'SHIPPED' AND OLD.status = 'PAID' THEN
    IF caller_id IS NULL OR caller_is_admin IS TRUE THEN
      RETURN NEW;
    END IF;

    IF caller_id IS DISTINCT FROM NEW.seller_id THEN
      RAISE EXCEPTION 'Unauthorized: only the seller can mark a transaction as shipped'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status = 'COMPLETED' AND OLD.status = 'SHIPPED' THEN
    IF escrow_rpc_marker IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'INVALID_ESCROW_RELEASE: use release_escrow_funds to complete shipped transactions'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status = 'DISPUTED' AND OLD.status = 'SHIPPED' THEN
    IF caller_id IS NULL OR caller_is_admin IS TRUE THEN
      RETURN NEW;
    END IF;

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

  IF NOT COALESCE(v_is_admin, FALSE) AND v_tx.buyer_id != p_buyer_id THEN
    RAISE EXCEPTION 'FORBIDDEN: transaction % does not belong to buyer %',
      p_transaction_id, p_buyer_id
      USING ERRCODE = '42501';
  END IF;

  IF v_tx.status != 'SHIPPED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: expected SHIPPED but got % for transaction %',
      v_tx.status, p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  -- The payment-finalization path credits seller net card earnings plus
  -- shipping passthrough, which is equivalent to total_amount - fee_amount.
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

  PERFORM set_config('pokemarket.release_escrow_funds', 'on', TRUE);

  UPDATE public.transactions
     SET status = 'COMPLETED'
   WHERE id = p_transaction_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.release_escrow_funds(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(UUID, UUID) TO service_role;
