-- Keep escrow release and transaction completion atomic and aligned with the
-- amount credited by post-payment finalization.

CREATE OR REPLACE FUNCTION public.guard_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id       UUID;
  caller_is_admin BOOLEAN := FALSE;
BEGIN
  caller_id := auth.uid();

  -- Completing an order without release_escrow_funds would strand the
  -- seller's pending balance. Require the transaction-local marker set by
  -- that RPC even for privileged callers.
  IF NEW.status = 'COMPLETED' AND OLD.status = 'SHIPPED'
     AND current_setting('pokemarket.release_escrow', TRUE) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Unauthorized: transactions must be completed through release_escrow_funds'
      USING ERRCODE = '42501';
  END IF;

  -- service_role: auth.uid() is NULL.
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (role = 'admin') INTO caller_is_admin
  FROM public.profiles
  WHERE id = caller_id;

  IF caller_is_admin IS TRUE THEN
    RETURN NEW;
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

    IF NOT COALESCE(v_is_admin, FALSE) AND v_caller_id IS DISTINCT FROM p_buyer_id THEN
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

  IF NOT COALESCE(v_is_admin, FALSE)
     AND v_tx.buyer_id IS DISTINCT FROM p_buyer_id THEN
    RAISE EXCEPTION 'FORBIDDEN: transaction % does not belong to buyer %',
      p_transaction_id, p_buyer_id
      USING ERRCODE = '42501';
  END IF;

  IF v_tx.status != 'SHIPPED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: expected SHIPPED but got % for transaction %',
      v_tx.status, p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  -- post-payment credits total_amount - fee_amount: card proceeds after the
  -- platform fee plus shipping, which is passed through without a fee.
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

  -- Move the money first. A mismatch raises and leaves the transaction
  -- SHIPPED so it can be retried after reconciliation.
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

  PERFORM set_config('pokemarket.release_escrow', 'true', TRUE);

  UPDATE public.transactions
     SET status = 'COMPLETED'
   WHERE id = p_transaction_id;

  PERFORM set_config('pokemarket.release_escrow', 'false', TRUE);

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.release_escrow_funds(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(UUID, UUID) TO service_role;
