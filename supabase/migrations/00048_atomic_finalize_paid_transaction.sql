-- 00048: Atomic paid-checkout finalization
--
-- The Stripe webhook and success-page reconcile path can both finalize the same
-- checkout. Keep all critical database side effects in one Postgres transaction
-- under a row lock so a transient failure cannot leave a PAID transaction
-- without the seller wallet credit.

CREATE OR REPLACE FUNCTION public.finalize_paid_transaction(
  p_transaction_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tx              RECORD;
  v_seller_net      NUMERIC(10,2);
  v_wallet_rows     INTEGER;
  v_conversation_id UUID;
BEGIN
  SELECT *
    INTO v_tx
    FROM public.transactions
   WHERE id = p_transaction_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'NOT_FOUND';
  END IF;

  IF v_tx.status != 'PENDING_PAYMENT' THEN
    RETURN 'ALREADY_PROCESSED';
  END IF;

  v_seller_net := ROUND(
    COALESCE(v_tx.total_amount, 0::NUMERIC)
    - COALESCE(v_tx.shipping_cost, 0::NUMERIC)
    - COALESCE(v_tx.fee_amount, 0::NUMERIC),
    2
  );

  IF v_seller_net <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: seller_net is % (must be > 0) for transaction %',
      v_seller_net, p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.listings
     SET status = 'SOLD'
   WHERE id = v_tx.listing_id;

  UPDATE public.wallets
     SET pending_balance = ROUND(pending_balance + v_seller_net, 2)
   WHERE user_id = v_tx.seller_id;

  GET DIAGNOSTICS v_wallet_rows = ROW_COUNT;

  IF v_wallet_rows = 0 THEN
    RAISE EXCEPTION 'MISSING_WALLET: seller % has no wallet for transaction %',
      v_tx.seller_id, p_transaction_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.offers
     SET status = 'EXPIRED'
   WHERE listing_id = v_tx.listing_id
     AND status = 'PENDING';

  SELECT id
    INTO v_conversation_id
    FROM public.conversations
   WHERE listing_id = v_tx.listing_id
     AND buyer_id = v_tx.buyer_id
     AND seller_id = v_tx.seller_id
   LIMIT 1;

  IF v_conversation_id IS NOT NULL THEN
    INSERT INTO public.messages (
      conversation_id,
      sender_id,
      content,
      message_type,
      metadata
    )
    VALUES (
      v_conversation_id,
      v_tx.buyer_id,
      'Paiement confirmé ! La commande est en attente d''expédition.',
      'payment_completed',
      jsonb_build_object('transaction_id', p_transaction_id)
    );
  END IF;

  UPDATE public.transactions
     SET status = 'PAID'
   WHERE id = p_transaction_id;

  RETURN 'PAID';
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_paid_transaction(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_paid_transaction(UUID) TO service_role;
