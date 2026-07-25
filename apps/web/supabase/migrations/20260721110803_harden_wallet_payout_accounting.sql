-- Harden wallet and transaction accounting invariants.
--
-- 1. Escrow release moves the exact amount credited at payment finalization:
--    total_amount - fee_amount (card net plus shipping passthrough).
-- 2. Wallet movement succeeds before an order can become COMPLETED.
-- 3. Direct client writes cannot forge PAID or bypass escrow completion.
-- 4. Failed pre-transfer payout attempts can restore reserved funds atomically.

CREATE OR REPLACE FUNCTION public.guard_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id       UUID;
  caller_is_admin BOOLEAN := FALSE;
  release_marker  TEXT;
BEGIN
  caller_id := auth.uid();
  release_marker := current_setting('app.release_escrow_funds', TRUE);

  -- COMPLETED is only legal from SHIPPED, and only via release_escrow_funds
  -- (which sets the transaction-local marker). Without this, a buyer/seller
  -- with a permissive UPDATE RLS policy can forge PAID/PENDING → COMPLETED
  -- and strand escrow in pending_balance forever.
  IF NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'SHIPPED' THEN
    RAISE EXCEPTION 'INVALID_COMPLETION: transactions can only complete from SHIPPED'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'COMPLETED' AND OLD.status = 'SHIPPED'
     AND release_marker IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'INVALID_COMPLETION: use release_escrow_funds to complete shipped transactions'
      USING ERRCODE = '42501';
  END IF;

  -- Trusted server-side payment handlers use service_role (auth.uid() is NULL).
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (role = 'admin') INTO caller_is_admin
  FROM public.profiles
  WHERE id = caller_id;

  IF caller_is_admin IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Payment confirmation must only come from trusted Stripe handlers.
  IF NEW.status = 'PAID' AND OLD.status IS DISTINCT FROM 'PAID' THEN
    RAISE EXCEPTION 'Unauthorized: only trusted payment handlers can mark a transaction as paid'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'SHIPPED' AND OLD.status = 'PAID'
     AND caller_id IS DISTINCT FROM NEW.seller_id THEN
    RAISE EXCEPTION 'Unauthorized: only the seller can mark a transaction as shipped'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'COMPLETED' AND OLD.status = 'SHIPPED'
     AND caller_id IS DISTINCT FROM NEW.buyer_id THEN
    RAISE EXCEPTION 'Unauthorized: only the buyer can confirm reception'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'DISPUTED' AND OLD.status = 'SHIPPED'
     AND caller_id IS DISTINCT FROM NEW.buyer_id THEN
    RAISE EXCEPTION 'Unauthorized: only the buyer can open a dispute'
      USING ERRCODE = '42501';
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
     SET pending_balance   = ROUND(pending_balance - v_seller_net, 2),
         available_balance = ROUND(available_balance + v_seller_net, 2)
   WHERE user_id = v_tx.seller_id
     AND pending_balance >= v_seller_net;

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

CREATE OR REPLACE FUNCTION public.add_wallet_available_balance(
  p_user_id UUID,
  p_delta   NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_delta <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: p_delta must be positive'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.wallets
     SET available_balance = ROUND(available_balance + p_delta, 2)
   WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: wallet for user % does not exist', p_user_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.add_wallet_available_balance(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_wallet_available_balance(UUID, NUMERIC) TO service_role;

-- Financial amounts on a transaction are immutable for end users. Seller/buyer
-- UPDATE RLS policies otherwise let a participant inflate total_amount after
-- Stripe charged the real (lower) amount, causing finalizePaidTransaction to
-- credit more pending_balance than was captured.
CREATE OR REPLACE FUNCTION public.guard_transaction_financial_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- service_role (auth.uid() IS NULL) may correct rows during ops/refunds.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.fee_amount IS DISTINCT FROM OLD.fee_amount
     OR NEW.shipping_cost IS DISTINCT FROM OLD.shipping_cost THEN
    RAISE EXCEPTION 'IMMUTABLE_FIELDS: total_amount, fee_amount, and shipping_cost cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_financial_fields_guard ON public.transactions;
CREATE TRIGGER transactions_financial_fields_guard
  BEFORE UPDATE OF total_amount, fee_amount, shipping_cost ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_transaction_financial_fields();
