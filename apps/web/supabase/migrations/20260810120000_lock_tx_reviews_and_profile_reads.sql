-- Critical hardening:
-- 1) Buyers/sellers must not UPDATE transactions via PostgREST. Status changes
--    (COMPLETED / DISPUTED / SHIPPED) and shipping fields go through SECURITY
--    DEFINER RPCs (release_escrow_funds, create_dispute, ship_order) which
--    bypass RLS. Direct SHIPPED→COMPLETED previously skipped escrow release.
-- 2) Reviews may only be inserted by the buyer, for the seller, on COMPLETED
--    orders (blocks self-reviews and stolen review slots).
-- 3) Sensitive profile columns are not grantable to anon/authenticated;
--    own-row secrets are exposed via profiles_me (security_invoker=false).

-- ---------------------------------------------------------------------------
-- 1. Lock transaction mutations to RPCs / service_role
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "transactions_update_buyer" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update_seller" ON public.transactions;

CREATE OR REPLACE FUNCTION public.guard_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid;
  caller_is_admin boolean := false;
  allow_rpc boolean := false;
BEGIN
  caller_id := auth.uid();

  -- Session flag set by trusted SECURITY DEFINER RPCs for this transaction only.
  allow_rpc :=
    current_setting('pokemarket.allow_tx_status_transition', true) = '1';

  -- service_role: auth.uid() is NULL → unrestricted (webhooks, admin client)
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (role = 'admin') INTO caller_is_admin
  FROM public.profiles
  WHERE id = caller_id;

  IF caller_is_admin IS TRUE THEN
    RETURN NEW;
  END IF;

  IF allow_rpc THEN
    RETURN NEW;
  END IF;

  -- Legacy direct PAID→SHIPPED is no longer allowed for JWT clients.
  -- ship_order sets the bypass flag before updating.
  IF NEW.status = 'SHIPPED' AND OLD.status = 'PAID' THEN
    RAISE EXCEPTION
      'FORBIDDEN: mark shipped via ship_order RPC'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'COMPLETED' AND OLD.status = 'SHIPPED' THEN
    RAISE EXCEPTION
      'FORBIDDEN: confirm reception via release_escrow_funds RPC'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'DISPUTED' AND OLD.status = 'SHIPPED' THEN
    RAISE EXCEPTION
      'FORBIDDEN: open disputes via create_dispute RPC'
      USING ERRCODE = '42501';
  END IF;

  RAISE EXCEPTION
    'FORBIDDEN: invalid transaction status transition % → %',
    OLD.status, NEW.status
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION private.release_escrow_funds(
  p_transaction_id uuid,
  p_buyer_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_is_admin boolean := false;
  v_tx public.transactions%ROWTYPE;
  v_seller_minor bigint;
  v_pending_balance_minor bigint;
  v_release_ledger_id uuid;
  v_pending_account_id uuid;
  v_available_account_id uuid;
BEGIN
  v_caller_id := auth.uid();

  SELECT *
    INTO v_tx
    FROM public.transactions
   WHERE id = p_transaction_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: transaction % does not exist', p_transaction_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_caller_id IS NOT NULL THEN
    SELECT role = 'admin'
      INTO v_is_admin
      FROM public.profiles
     WHERE id = v_caller_id;

    IF NOT COALESCE(v_is_admin, false)
       AND (
         v_caller_id IS DISTINCT FROM p_buyer_id
         OR v_tx.buyer_id IS DISTINCT FROM p_buyer_id
       ) THEN
      RAISE EXCEPTION 'FORBIDDEN: only the buyer can release escrow'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT id
    INTO v_release_ledger_id
    FROM public.ledger_transactions
   WHERE idempotency_key = 'escrow-release:' || p_transaction_id::text;

  IF v_tx.status = 'COMPLETED' AND v_release_ledger_id IS NOT NULL THEN
    RETURN true;
  END IF;

  IF v_tx.status NOT IN ('SHIPPED', 'COMPLETED') THEN
    RAISE EXCEPTION
      'INVALID_STATUS: expected SHIPPED or recoverable COMPLETED but got % for transaction %',
      v_tx.status, p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.ledger_transactions
     WHERE idempotency_key = 'payment:' || v_tx.id::text
  ) THEN
    RAISE EXCEPTION
      'MISSING_PAYMENT_LEDGER: transaction % cannot release escrow safely',
      v_tx.id
      USING ERRCODE = 'P0001';
  END IF;

  v_seller_minor :=
    round((v_tx.total_amount - v_tx.fee_amount) * 100)::bigint;

  v_pending_account_id := private.get_or_create_ledger_account(
    'seller_pending', v_tx.seller_id, v_tx.id, 'EUR'
  );

  SELECT COALESCE(sum(amount_minor), 0)
    INTO v_pending_balance_minor
    FROM public.ledger_entries
   WHERE account_id = v_pending_account_id;

  IF v_pending_balance_minor < v_seller_minor THEN
    RAISE EXCEPTION
      'ESCROW_BALANCE_MISMATCH: seller % transaction % has % pending, requires %',
      v_tx.seller_id, v_tx.id, v_pending_balance_minor, v_seller_minor
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.ledger_transactions (
    transaction_id,
    journal_type,
    idempotency_key,
    business_reference,
    metadata
  )
  VALUES (
    v_tx.id,
    'escrow_released',
    'escrow-release:' || v_tx.id::text,
    'order-escrow-release:' || v_tx.id::text,
    jsonb_build_object('seller_minor', v_seller_minor)
  )
  RETURNING id INTO v_release_ledger_id;

  v_available_account_id := private.get_or_create_ledger_account(
    'seller_available', v_tx.seller_id, v_tx.id, 'EUR'
  );

  INSERT INTO public.ledger_entries (
    ledger_transaction_id,
    account_id,
    amount_minor
  )
  VALUES
    (v_release_ledger_id, v_pending_account_id, -v_seller_minor),
    (v_release_ledger_id, v_available_account_id, v_seller_minor);

  IF v_tx.status = 'SHIPPED' THEN
    PERFORM set_config('pokemarket.allow_tx_status_transition', '1', true);
    UPDATE public.transactions
       SET status = 'COMPLETED'
     WHERE id = v_tx.id;
  END IF;

  PERFORM private.rebuild_wallet_projection(v_tx.seller_id);

  INSERT INTO public.financial_outbox (
    event_type,
    aggregate_id,
    idempotency_key,
    payload
  )
  VALUES (
    'transfer_requested',
    v_tx.id,
    'transfer-requested:' || v_tx.id::text,
    jsonb_build_object(
      'transaction_id', v_tx.id,
      'seller_id', v_tx.seller_id,
      'amount_minor', v_seller_minor,
      'currency', 'EUR'
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN true;
END;
$$;

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

  PERFORM set_config('pokemarket.allow_tx_status_transition', '1', true);

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

CREATE OR REPLACE FUNCTION public.create_dispute(
  p_transaction_id UUID,
  p_reason TEXT,
  p_description TEXT,
  p_conversation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_buyer_id UUID;
  v_seller_id UUID;
  v_listing_id UUID;
  v_status TEXT;
  v_trimmed TEXT;
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

  SELECT buyer_id, seller_id, listing_id, status
  INTO v_buyer_id, v_seller_id, v_listing_id, v_status
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

  IF v_caller_id IS NOT NULL AND v_caller_id != v_buyer_id THEN
    RAISE EXCEPTION 'FORBIDDEN: only the buyer can open a dispute'
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

  PERFORM set_config('pokemarket.allow_tx_status_transition', '1', true);

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

REVOKE ALL ON FUNCTION public.ship_order(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ship_order(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ship_order(UUID, TEXT, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.create_dispute(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_dispute(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_dispute(UUID, TEXT, TEXT, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Harden reviews INSERT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "reviews_insert_participant" ON public.reviews;

CREATE POLICY "reviews_insert_buyer_completed" ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = reviewer_id
    AND reviewer_id IS DISTINCT FROM reviewee_id
    AND EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.id = transaction_id
        AND t.buyer_id = (SELECT auth.uid())
        AND t.seller_id = reviewee_id
        AND t.status = 'COMPLETED'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Narrow profiles column privileges + own-row view
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;

GRANT ALL ON TABLE public.profiles TO service_role;
GRANT SELECT (
  id,
  username,
  avatar_url,
  bio,
  country_code,
  instagram_url,
  facebook_url,
  tiktok_url,
  created_at,
  updated_at
) ON TABLE public.profiles TO anon, authenticated;

GRANT UPDATE (
  username,
  avatar_url,
  bio,
  country_code,
  instagram_url,
  facebook_url,
  tiktok_url,
  address_line,
  city,
  postal_code,
  updated_at
) ON TABLE public.profiles TO authenticated;

CREATE OR REPLACE VIEW public.profiles_me
WITH (security_invoker = false) AS
SELECT
  id,
  username,
  avatar_url,
  bio,
  country_code,
  instagram_url,
  facebook_url,
  tiktok_url,
  address_line,
  city,
  postal_code,
  stripe_account_id,
  stripe_customer_id,
  kyc_status,
  role,
  created_at,
  updated_at
FROM public.profiles
WHERE id = (SELECT auth.uid());

GRANT SELECT ON public.profiles_me TO authenticated;

NOTIFY pgrst, 'reload schema';
