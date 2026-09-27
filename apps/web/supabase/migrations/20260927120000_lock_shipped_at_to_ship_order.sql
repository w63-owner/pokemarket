-- The daily auto-complete cron releases escrow for SHIPPED orders whose
-- shipped_at is older than 14 days. Seller and buyer UPDATE policies still
-- allow either participant to rewrite shipped_at without changing status, so
-- the status-transition trigger never runs.
--
-- A seller can backdate shipped_at and collect the payout on the next cron
-- tick, closing the buyer's dispute window. A buyer can push shipped_at into
-- the future and strand the seller's escrow indefinitely.
--
-- ship_order is the only authenticated writer. It sets a transaction-local
-- flag before recording now(). service_role (auth.uid() IS NULL) stays
-- allowed for webhooks, tests, and maintenance.

BEGIN;

CREATE OR REPLACE FUNCTION private.guard_transaction_shipped_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.shipped_at IS NOT DISTINCT FROM OLD.shipped_at THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_setting('deckdealr.ship_order', true) = 'on' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'FORBIDDEN: shipped_at can only be set by ship_order'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION private.guard_transaction_shipped_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS transactions_shipped_at_guard ON public.transactions;

CREATE TRIGGER transactions_shipped_at_guard
  BEFORE UPDATE OF shipped_at ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_transaction_shipped_at();

CREATE OR REPLACE FUNCTION public.ship_order(
  p_transaction_id UUID,
  p_tracking_number TEXT,
  p_tracking_url TEXT,
  p_conversation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_seller_id UUID;
  v_buyer_id UUID;
  v_listing_id UUID;
  v_status TEXT;
  v_now TIMESTAMPTZ := now();
  v_metadata JSONB;
BEGIN
  IF p_tracking_number IS NULL OR length(trim(p_tracking_number)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: tracking_number is required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT seller_id, buyer_id, listing_id, status
  INTO v_seller_id, v_buyer_id, v_listing_id, v_status
  FROM public.transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: transaction % does not exist', p_transaction_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_caller_id IS NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: authenticated user required'
      USING ERRCODE = '42501';
  END IF;

  IF v_caller_id IS NOT NULL AND v_caller_id != v_seller_id THEN
    RAISE EXCEPTION 'FORBIDDEN: only the seller can ship the order'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations
    WHERE id = p_conversation_id
      AND listing_id = v_listing_id
      AND buyer_id = v_buyer_id
      AND seller_id = v_seller_id
  ) THEN
    RAISE EXCEPTION 'INVALID_CONVERSATION: conversation does not match transaction'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status != 'PAID' THEN
    RAISE EXCEPTION 'INVALID_STATUS: expected PAID but got % for transaction %',
      v_status, p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Transaction-local. A later PostgREST update is a new transaction and
  -- cannot reuse this flag to rewrite the clock.
  PERFORM set_config('deckdealr.ship_order', 'on', true);

  UPDATE public.transactions
  SET status = 'SHIPPED',
      tracking_number = p_tracking_number,
      tracking_url = p_tracking_url,
      shipped_at = v_now
  WHERE id = p_transaction_id;

  v_metadata := jsonb_build_object(
    'tracking_number', p_tracking_number,
    'shipped_at', v_now
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

COMMIT;
