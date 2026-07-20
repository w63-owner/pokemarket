-- Finalize the financially critical payment side effects in one transaction.
--
-- The application previously marked a transaction PAID before updating the
-- listing, seller wallet, and competing offers. Any later failure made webhook
-- retries short-circuit on PAID and permanently stranded a charged order.

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

  -- The persisted fee was calculated from the card price only. Shipping is
  -- passed through in full, so total minus fee is the exact seller credit.
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
         stripe_payment_intent_id = COALESCE(
           p_payment_intent_id,
           t.stripe_payment_intent_id
         ),
         stripe_charge_id = COALESCE(p_charge_id, t.stripe_charge_id)
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

REVOKE ALL ON FUNCTION public.finalize_paid_transaction_core(UUID, TEXT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_paid_transaction_core(UUID, TEXT, TEXT)
  TO service_role;
