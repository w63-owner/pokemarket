-- =====================================================================
-- RPC: get_inbox
-- Returns conversation previews with only the last message and unread
-- count per conversation, instead of fetching ALL messages client-side.
-- =====================================================================

CREATE OR REPLACE FUNCTION get_inbox(p_user_id UUID)
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
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    c.id,
    c.listing_id,
    c.buyer_id,
    c.seller_id,
    c.created_at,
    l.title                    AS listing_title,
    l.cover_image_url          AS listing_cover_image_url,
    l.display_price            AS listing_display_price,
    l.status                   AS listing_status,
    CASE WHEN c.buyer_id = p_user_id THEN p_s.id ELSE p_b.id END           AS other_user_id,
    CASE WHEN c.buyer_id = p_user_id THEN p_s.username ELSE p_b.username END AS other_user_username,
    CASE WHEN c.buyer_id = p_user_id THEN p_s.avatar_url ELSE p_b.avatar_url END AS other_user_avatar_url,
    lm.content                 AS last_message_content,
    lm.message_type            AS last_message_type,
    lm.created_at              AS last_message_created_at,
    lm.sender_id               AS last_message_sender_id,
    COALESCE(uc.cnt, 0)        AS unread_count
  FROM conversations c
  JOIN listings l  ON l.id  = c.listing_id
  JOIN profiles p_b ON p_b.id = c.buyer_id
  JOIN profiles p_s ON p_s.id = c.seller_id
  LEFT JOIN LATERAL (
    SELECT m.content, m.message_type, m.created_at, m.sender_id
    FROM messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM messages m
    WHERE m.conversation_id = c.id
      AND m.read_at IS NULL
      AND m.sender_id != p_user_id
  ) uc ON TRUE
  WHERE c.buyer_id = p_user_id OR c.seller_id = p_user_id
  ORDER BY COALESCE(lm.created_at, c.created_at) DESC;
$$;

-- =====================================================================
-- RPC: upsert_conversation
-- Atomically finds or creates a conversation, avoiding the race
-- condition between SELECT + INSERT on the client.
-- =====================================================================

CREATE OR REPLACE FUNCTION upsert_conversation(
  p_listing_id UUID,
  p_buyer_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_seller_id UUID;
  v_conversation_id UUID;
BEGIN
  SELECT seller_id INTO v_seller_id
  FROM listings
  WHERE id = p_listing_id;

  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Annonce introuvable';
  END IF;

  IF v_seller_id = p_buyer_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas vous envoyer un message';
  END IF;

  INSERT INTO conversations (listing_id, buyer_id, seller_id)
  VALUES (p_listing_id, p_buyer_id, v_seller_id)
  ON CONFLICT ON CONSTRAINT unique_conversation DO NOTHING
  RETURNING id INTO v_conversation_id;

  IF v_conversation_id IS NULL THEN
    SELECT id INTO v_conversation_id
    FROM conversations
    WHERE listing_id = p_listing_id
      AND buyer_id = p_buyer_id
      AND seller_id = v_seller_id;
  END IF;

  RETURN v_conversation_id;
END;
$$;
