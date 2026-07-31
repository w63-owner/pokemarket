-- Sprint 0: make user-authored messages immutable and reserve business
-- message types for the vetted transactional RPCs/service role.

DROP POLICY IF EXISTS "messages_insert_participant" ON public.messages;

CREATE POLICY "messages_insert_participant"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = sender_id
    AND message_type IN ('text', 'image')
    AND read_at IS NULL
    AND offer_id IS NULL
    AND conversation_id IN (
      SELECT conversations.id
      FROM public.conversations
      WHERE conversations.buyer_id = (SELECT auth.uid())
         OR conversations.seller_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_message_insert_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.created_at := statement_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_message_insert_defaults() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_message_insert_defaults ON public.messages;
CREATE TRIGGER enforce_message_insert_defaults
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_insert_defaults();

-- RLS decides which recipient may mark a row as read. This trigger makes the
-- row immutable apart from the null -> server-timestamped read_at transition.
CREATE OR REPLACE FUNCTION public.enforce_message_read_receipt_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'read_at') IS DISTINCT FROM
     (to_jsonb(OLD) - 'read_at') THEN
    RAISE EXCEPTION 'MESSAGE_IMMUTABLE: only read_at may be updated'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.read_at IS NOT NULL OR NEW.read_at IS NULL THEN
    RAISE EXCEPTION 'INVALID_READ_RECEIPT: read_at must transition from null'
      USING ERRCODE = 'P0001';
  END IF;

  NEW.read_at := statement_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_message_read_receipt_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_message_read_receipt_update ON public.messages;
CREATE TRIGGER enforce_message_read_receipt_update
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_read_receipt_update();

-- Ignore the caller-controlled user id. Keeping the argument preserves the
-- generated client contract while auth.uid() remains the sole authority.
CREATE OR REPLACE FUNCTION public.get_inbox(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  listing_id UUID,
  buyer_id UUID,
  seller_id UUID,
  created_at TIMESTAMPTZ,
  listing_title TEXT,
  listing_cover_image_url TEXT,
  listing_display_price NUMERIC,
  listing_status TEXT,
  other_user_id UUID,
  other_user_username TEXT,
  other_user_avatar_url TEXT,
  last_message_content TEXT,
  last_message_type TEXT,
  last_message_created_at TIMESTAMPTZ,
  last_message_sender_id UUID,
  unread_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    c.id,
    c.listing_id,
    c.buyer_id,
    c.seller_id,
    c.created_at,
    l.title,
    l.cover_image_url,
    l.display_price,
    l.status,
    CASE WHEN c.buyer_id = (SELECT auth.uid()) THEN p_s.id ELSE p_b.id END,
    CASE WHEN c.buyer_id = (SELECT auth.uid()) THEN p_s.username ELSE p_b.username END,
    CASE WHEN c.buyer_id = (SELECT auth.uid()) THEN p_s.avatar_url ELSE p_b.avatar_url END,
    lm.content,
    lm.message_type,
    lm.created_at,
    lm.sender_id,
    COALESCE(uc.cnt, 0)
  FROM public.conversations AS c
  JOIN public.listings AS l ON l.id = c.listing_id
  JOIN public.profiles AS p_b ON p_b.id = c.buyer_id
  JOIN public.profiles AS p_s ON p_s.id = c.seller_id
  LEFT JOIN LATERAL (
    SELECT m.content, m.message_type, m.created_at, m.sender_id
    FROM public.messages AS m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) AS lm ON TRUE
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.messages AS m
    WHERE m.conversation_id = c.id
      AND m.read_at IS NULL
      AND m.sender_id != (SELECT auth.uid())
  ) AS uc ON TRUE
  WHERE c.buyer_id = (SELECT auth.uid())
     OR c.seller_id = (SELECT auth.uid())
  ORDER BY COALESCE(lm.created_at, c.created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.get_inbox(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inbox(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inbox(UUID) TO service_role;

-- A seller must not be able to use the participant INSERT policy to create a
-- conversation on behalf of an arbitrary buyer.
CREATE OR REPLACE FUNCTION public.upsert_conversation(
  p_listing_id UUID,
  p_buyer_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_buyer_id UUID;
  v_seller_id UUID;
  v_conversation_id UUID;
BEGIN
  IF v_caller_id IS NULL AND auth.role() = 'service_role' THEN
    v_buyer_id := p_buyer_id;
  ELSIF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: authenticated user required'
      USING ERRCODE = '42501';
  ELSIF p_buyer_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'FORBIDDEN: buyer must match authenticated user'
      USING ERRCODE = '42501';
  ELSE
    v_buyer_id := v_caller_id;
  END IF;

  SELECT listings.seller_id
  INTO v_seller_id
  FROM public.listings
  WHERE listings.id = p_listing_id;

  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Annonce introuvable';
  END IF;

  IF v_seller_id = v_buyer_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas vous envoyer un message';
  END IF;

  INSERT INTO public.conversations (listing_id, buyer_id, seller_id)
  VALUES (p_listing_id, v_buyer_id, v_seller_id)
  ON CONFLICT ON CONSTRAINT unique_conversation DO NOTHING
  RETURNING conversations.id INTO v_conversation_id;

  IF v_conversation_id IS NULL THEN
    SELECT conversations.id
    INTO v_conversation_id
    FROM public.conversations
    WHERE conversations.listing_id = p_listing_id
      AND conversations.buyer_id = v_buyer_id
      AND conversations.seller_id = v_seller_id;
  END IF;

  RETURN v_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_conversation(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_conversation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_conversation(UUID, UUID) TO service_role;

-- Transactional system-message RPCs run with narrowly checked definer rights:
-- authenticated callers are explicitly matched to the transaction participant,
-- and the supplied conversation must represent that exact transaction listing.
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
