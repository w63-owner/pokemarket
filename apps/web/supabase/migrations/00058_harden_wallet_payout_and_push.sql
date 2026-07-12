-- 00058: Harden wallet accounting, transaction status transitions, and Expo token ownership.
--
-- Critical fixes:
--   * payment finalization core is now one database transaction for the
--     PAID/listing/wallet/offer side-effects that must not split;
--   * escrow release moves the same seller net credited at payment time and
--     fails before COMPLETED if the wallet move cannot happen;
--   * direct authenticated status PATCHes can no longer fake payment or bypass
--     the escrow RPC;
--   * one Expo push token belongs to one user at a time.

CREATE OR REPLACE FUNCTION public.finalize_paid_transaction_core(
  p_transaction_id UUID,
  p_payment_intent_id TEXT DEFAULT NULL,
  p_charge_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  result TEXT,
  id UUID,
  listing_id UUID,
  buyer_id UUID,
  seller_id UUID,
  total_amount NUMERIC,
  shipping_cost NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tx          public.transactions%ROWTYPE;
  v_seller_net  NUMERIC(10,2);
  v_rows_wallet INTEGER;
BEGIN
  SELECT *
    INTO v_tx
    FROM public.transactions AS t
   WHERE t.id = p_transaction_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'NOT_FOUND'::TEXT,
      NULL::UUID,
      NULL::UUID,
      NULL::UUID,
      NULL::UUID,
      NULL::NUMERIC,
      NULL::NUMERIC;
    RETURN;
  END IF;

  IF v_tx.status != 'PENDING_PAYMENT' THEN
    RETURN QUERY SELECT
      'ALREADY_PROCESSED'::TEXT,
      v_tx.id,
      v_tx.listing_id,
      v_tx.buyer_id,
      v_tx.seller_id,
      v_tx.total_amount,
      COALESCE(v_tx.shipping_cost, 0::NUMERIC);
    RETURN;
  END IF;

  -- finalizePaidTransaction credits card net + shipping, which is exactly the
  -- persisted total minus the platform fee.
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

  UPDATE public.listings AS l
     SET status = 'SOLD'
   WHERE l.id = v_tx.listing_id;

  UPDATE public.wallets
     SET pending_balance = ROUND(pending_balance + v_seller_net, 2)
   WHERE user_id = v_tx.seller_id;

  GET DIAGNOSTICS v_rows_wallet = ROW_COUNT;

  IF v_rows_wallet = 0 THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: seller % wallet is missing for transaction %',
      v_tx.seller_id, p_transaction_id
      USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.offers
     SET status = 'EXPIRED'
   WHERE listing_id = v_tx.listing_id
     AND status = 'PENDING';

  UPDATE public.transactions AS t
     SET status = 'PAID',
         stripe_payment_intent_id = COALESCE(p_payment_intent_id, stripe_payment_intent_id),
         stripe_charge_id = COALESCE(p_charge_id, stripe_charge_id)
   WHERE t.id = p_transaction_id;

  RETURN QUERY SELECT
    'PAID'::TEXT,
    v_tx.id,
    v_tx.listing_id,
    v_tx.buyer_id,
    v_tx.seller_id,
    v_tx.total_amount,
    COALESCE(v_tx.shipping_cost, 0::NUMERIC);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_paid_transaction_core(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_paid_transaction_core(UUID, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id       UUID;
  caller_is_admin BOOLEAN := FALSE;
  via_escrow_rpc  BOOLEAN := FALSE;
BEGIN
  caller_id := auth.uid();

  -- service_role: auth.uid() is NULL -> unrestricted (webhooks, cron, admin client).
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (role = 'admin') INTO caller_is_admin
  FROM public.profiles
  WHERE id = caller_id;

  IF caller_is_admin IS TRUE THEN
    RETURN NEW;
  END IF;

  via_escrow_rpc := COALESCE(current_setting('app.release_escrow_funds', TRUE), '') = 'on';

  -- PAID -> SHIPPED: only the seller can mark a package as shipped.
  IF OLD.status = 'PAID' AND NEW.status = 'SHIPPED' THEN
    IF caller_id IS DISTINCT FROM NEW.seller_id THEN
      RAISE EXCEPTION 'Unauthorized: only the seller can mark a transaction as shipped'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- SHIPPED -> DISPUTED: only the buyer can open a dispute.
  IF OLD.status = 'SHIPPED' AND NEW.status = 'DISPUTED' THEN
    IF caller_id IS DISTINCT FROM NEW.buyer_id THEN
      RAISE EXCEPTION 'Unauthorized: only the buyer can open a dispute'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- SHIPPED -> COMPLETED must go through release_escrow_funds so the wallet
  -- movement and status transition stay atomic.
  IF OLD.status = 'SHIPPED' AND NEW.status = 'COMPLETED' THEN
    IF NOT via_escrow_rpc THEN
      RAISE EXCEPTION 'Unauthorized: complete transactions through release_escrow_funds'
        USING ERRCODE = '42501';
    END IF;
    IF caller_id IS DISTINCT FROM NEW.buyer_id THEN
      RAISE EXCEPTION 'Unauthorized: only the buyer can confirm reception'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Unauthorized transaction status transition: % -> %',
    OLD.status, NEW.status
    USING ERRCODE = '42501';
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

  -- Release exactly what payment finalization credited: total minus platform fee
  -- (shipping is passed through to the seller and must not remain trapped).
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

  PERFORM set_config('app.release_escrow_funds', 'on', TRUE);

  UPDATE public.transactions
     SET status = 'COMPLETED'
   WHERE id = p_transaction_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.release_escrow_funds(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(UUID, UUID) TO service_role;

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

ALTER TABLE public.expo_push_tokens
  DROP CONSTRAINT IF EXISTS expo_push_tokens_user_id_token_key;

ALTER TABLE public.expo_push_tokens
  ADD CONSTRAINT expo_push_tokens_token_key UNIQUE (token);
