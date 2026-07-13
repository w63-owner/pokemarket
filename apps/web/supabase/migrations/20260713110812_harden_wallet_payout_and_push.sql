-- Harden wallet accounting, completion transitions, and Expo token ownership.
--
-- Critical fixes:
--   1. Escrow release must move the same seller amount credited on payment:
--      card net + shipping = total_amount - fee_amount.
--   2. A transaction must not become COMPLETED unless the wallet movement
--      succeeds in release_escrow_funds.
--   3. Buyers must not be able to bypass escrow release with a raw PostgREST
--      SHIPPED -> COMPLETED update.
--   4. A physical Expo token belongs to one current user only.

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

  IF caller_id IS NOT NULL THEN
    SELECT (role = 'admin') INTO caller_is_admin
      FROM public.profiles
     WHERE id = caller_id;
  END IF;

  -- SHIPPED -> COMPLETED is a financial transition. It is only valid from
  -- release_escrow_funds(), which sets this transaction-local marker immediately
  -- before updating the transaction after the wallet move has succeeded.
  IF NEW.status = 'COMPLETED' AND OLD.status = 'SHIPPED' THEN
    IF current_setting('app.release_escrow_funds', TRUE) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'COMPLETION_REQUIRES_ESCROW_RELEASE: use release_escrow_funds'
        USING ERRCODE = '42501';
    END IF;

    IF caller_id IS NOT NULL
       AND caller_is_admin IS NOT TRUE
       AND caller_id IS DISTINCT FROM NEW.buyer_id THEN
      RAISE EXCEPTION 'Unauthorized: only the buyer can confirm reception'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  -- service_role: auth.uid() is NULL -> unrestricted for non-completion
  -- maintenance transitions (webhooks, admin clients, cron).
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF caller_is_admin IS TRUE THEN
    RETURN NEW;
  END IF;

  -- PAID -> SHIPPED: only the seller can mark a package as shipped.
  IF NEW.status = 'SHIPPED' AND OLD.status = 'PAID' THEN
    IF caller_id IS DISTINCT FROM NEW.seller_id THEN
      RAISE EXCEPTION 'Unauthorized: only the seller can mark a transaction as shipped'
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

  -- Payment finalization credits card net plus shipping. Since fee_amount is
  -- computed only on the card display price, total_amount - fee_amount is the
  -- same amount and avoids subtracting shipping twice.
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

  -- Move wallet funds before marking COMPLETED. If the pending balance is
  -- missing or too low, fail the RPC so the order stays SHIPPED and can be
  -- retried/reconciled instead of silently losing seller funds.
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

  PERFORM set_config('app.release_escrow_funds', '1', TRUE);

  UPDATE public.transactions
     SET status = 'COMPLETED'
   WHERE id = p_transaction_id;

  PERFORM set_config('app.release_escrow_funds', '0', TRUE);

  RETURN TRUE;

EXCEPTION
  WHEN SQLSTATE '42501' OR SQLSTATE 'P0001' OR SQLSTATE 'P0002' OR SQLSTATE 'P0004' THEN
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.release_escrow_funds(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(UUID, UUID) TO service_role;

-- Transfer a device token to its latest owner before enforcing global
-- uniqueness, preventing cross-account push leakage on shared devices.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY token
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM public.expo_push_tokens
)
DELETE FROM public.expo_push_tokens e
USING ranked r
WHERE e.id = r.id
  AND r.rn > 1;

ALTER TABLE public.expo_push_tokens
  DROP CONSTRAINT IF EXISTS expo_push_tokens_user_id_token_key;

CREATE UNIQUE INDEX IF NOT EXISTS expo_push_tokens_token_key
  ON public.expo_push_tokens(token);
