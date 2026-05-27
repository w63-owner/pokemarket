-- 00054: Atomic RPCs for transaction state transitions
--
-- Replaces two failure-prone multi-step write paths from the mobile app
-- (and, follow-up, the web app):
--
--   shipOrder  → previously: UPDATE transactions  →  INSERT messages
--   createDispute → previously: INSERT disputes  →  UPDATE transactions  →  INSERT messages
--
-- Both flows could half-succeed when the network died between calls,
-- leaving the data model inconsistent (status flipped but no system
-- message rendered, or dispute row created but transaction still SHIPPED).
--
-- These RPCs run inside a single Postgres transaction, so a network
-- abort either commits everything or nothing.
--
-- Authorization model:
--   • SECURITY INVOKER → RLS + the status-transition guard trigger
--     (00041) still apply. The buyer/seller checks on individual
--     statements act as belt-and-braces alongside the trigger.
--   • A NULL `auth.uid()` (service-role) callers are allowed (legacy
--     admin paths could call these RPCs from server-side code).

-- ─────────────────────────────────────────────────────────────────────────────
-- ship_order(p_transaction_id, p_tracking_number, p_tracking_url, p_conversation_id)
-- Seller marks a PAID transaction as SHIPPED + posts the system
-- message + records tracking metadata. Returns void.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ship_order(
  p_transaction_id   UUID,
  p_tracking_number  TEXT,
  p_tracking_url     TEXT,
  p_conversation_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_seller_id UUID;
  v_status    TEXT;
  v_now       TIMESTAMPTZ := now();
  v_metadata  JSONB;
BEGIN
  IF v_caller_id IS NULL THEN
    -- Service-role callers from server-side code are allowed.
    NULL;
  END IF;

  IF p_tracking_number IS NULL OR length(trim(p_tracking_number)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: tracking_number is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock the row to serialize concurrent ship attempts (e.g. seller
  -- double-tap on the "Mark shipped" button).
  SELECT seller_id, status
    INTO v_seller_id, v_status
    FROM public.transactions
   WHERE id = p_transaction_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: transaction % does not exist', p_transaction_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_caller_id IS NOT NULL AND v_caller_id != v_seller_id THEN
    RAISE EXCEPTION 'FORBIDDEN: only the seller can ship the order'
      USING ERRCODE = '42501';
  END IF;

  IF v_status != 'PAID' THEN
    RAISE EXCEPTION 'INVALID_STATUS: expected PAID but got % for transaction %',
      v_status, p_transaction_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.transactions
     SET status           = 'SHIPPED',
         tracking_number  = p_tracking_number,
         tracking_url     = p_tracking_url,
         shipped_at       = v_now
   WHERE id = p_transaction_id;

  -- Build metadata that mirrors what the mobile/web client used to send.
  v_metadata := jsonb_build_object(
    'tracking_number', p_tracking_number,
    'shipped_at',      v_now
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

-- ─────────────────────────────────────────────────────────────────────────────
-- create_dispute(p_transaction_id, p_reason, p_description, p_conversation_id)
-- Buyer opens a dispute on a SHIPPED transaction. Inserts the dispute
-- row, flips the transaction to DISPUTED, and posts the system message
-- — atomically. Returns void.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_dispute(
  p_transaction_id   UUID,
  p_reason           TEXT,
  p_description      TEXT,
  p_conversation_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_caller_id    UUID := auth.uid();
  v_buyer_id     UUID;
  v_status       TEXT;
  v_trimmed      TEXT;
  v_reason_upper TEXT;
BEGIN
  v_trimmed := trim(COALESCE(p_description, ''));

  IF length(v_trimmed) < 10 THEN
    RAISE EXCEPTION 'INVALID_INPUT: description must be at least 10 chars'
      USING ERRCODE = 'P0001';
  END IF;

  -- API contract: clients send lowercase reasons (DisputeReason enum in
  -- @pokemarket/shared). The disputes_reason_check constraint requires
  -- uppercase ('DAMAGED_CARD', 'WRONG_CARD', 'EMPTY_PACKAGE', 'OTHER').
  -- Normalize at the DB boundary so the JS API surface stays lowercase
  -- and the historical SQL CHECK stays untouched.
  IF p_reason NOT IN ('damaged_card', 'wrong_card', 'empty_package', 'other') THEN
    RAISE EXCEPTION 'INVALID_INPUT: unknown dispute reason %', p_reason
      USING ERRCODE = 'P0001';
  END IF;

  v_reason_upper := upper(p_reason);

  -- Lock the transaction to serialize concurrent dispute openings.
  SELECT buyer_id, status
    INTO v_buyer_id, v_status
    FROM public.transactions
   WHERE id = p_transaction_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: transaction % does not exist', p_transaction_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_caller_id IS NOT NULL AND v_caller_id != v_buyer_id THEN
    RAISE EXCEPTION 'FORBIDDEN: only the buyer can open a dispute'
      USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION public.create_dispute(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_dispute(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_dispute(UUID, TEXT, TEXT, UUID) TO service_role;
