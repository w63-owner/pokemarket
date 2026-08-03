-- user_blocks SELECT is limited to rows where auth.uid() = blocker_id.
-- Policies/RPCs that checked "block in either direction" via a plain
-- NOT EXISTS against user_blocks therefore only worked for the blocker:
-- the blocked participant could not see the row, so INSERT/get_inbox
-- treated the conversation as unblocked.
--
-- Route all mutual-block checks through a narrow SECURITY DEFINER helper
-- that bypasses user_blocks RLS without exposing the table broadly.

CREATE OR REPLACE FUNCTION public.users_are_blocked(
  p_user_a uuid,
  p_user_b uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_blocks AS b
    WHERE (b.blocker_id = p_user_a AND b.blocked_id = p_user_b)
       OR (b.blocker_id = p_user_b AND b.blocked_id = p_user_a)
  );
$$;

REVOKE ALL ON FUNCTION public.users_are_blocked(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.users_are_blocked(uuid, uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "messages_insert_participant" ON public.messages;
CREATE POLICY "messages_insert_participant"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = sender_id
    AND message_type IN ('text', 'image')
    AND read_at IS NULL
    AND offer_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.conversations AS c
      WHERE c.id = conversation_id
        AND (SELECT auth.uid()) IN (c.buyer_id, c.seller_id)
        AND NOT public.users_are_blocked(c.buyer_id, c.seller_id)
    )
  );

CREATE OR REPLACE FUNCTION public.get_inbox(
  p_user_id uuid DEFAULT NULL,
  p_cursor_sort_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_search text DEFAULT NULL,
  p_archived boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  listing_id uuid,
  buyer_id uuid,
  seller_id uuid,
  created_at timestamptz,
  listing_title text,
  listing_cover_image_url text,
  listing_display_price numeric,
  listing_status text,
  other_user_id uuid,
  other_user_username text,
  other_user_avatar_url text,
  last_message_content text,
  last_message_type text,
  last_message_created_at timestamptz,
  last_message_sender_id uuid,
  unread_count bigint,
  sort_at timestamptz,
  archived_at timestamptz,
  muted_until timestamptz,
  transaction_status text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH inbox AS (
    SELECT
      c.id,
      c.listing_id,
      c.buyer_id,
      c.seller_id,
      c.created_at,
      l.title AS listing_title,
      l.cover_image_url AS listing_cover_image_url,
      l.display_price AS listing_display_price,
      l.status AS listing_status,
      CASE WHEN c.buyer_id = (SELECT auth.uid()) THEN p_s.id ELSE p_b.id END AS other_user_id,
      CASE WHEN c.buyer_id = (SELECT auth.uid()) THEN p_s.username ELSE p_b.username END AS other_user_username,
      CASE WHEN c.buyer_id = (SELECT auth.uid()) THEN p_s.avatar_url ELSE p_b.avatar_url END AS other_user_avatar_url,
      lm.content AS last_message_content,
      lm.message_type AS last_message_type,
      lm.created_at AS last_message_created_at,
      lm.sender_id AS last_message_sender_id,
      COALESCE(uc.cnt, 0) AS unread_count,
      COALESCE(lm.created_at, c.created_at, '-infinity'::timestamptz) AS sort_at,
      settings.archived_at,
      settings.muted_until,
      tx.status AS transaction_status
    FROM public.conversations AS c
    JOIN public.listings AS l ON l.id = c.listing_id
    JOIN public.profiles AS p_b ON p_b.id = c.buyer_id
    JOIN public.profiles AS p_s ON p_s.id = c.seller_id
    LEFT JOIN public.conversation_participant_settings AS settings
      ON settings.conversation_id = c.id
     AND settings.user_id = (SELECT auth.uid())
    LEFT JOIN LATERAL (
      SELECT m.content, m.message_type, m.created_at, m.sender_id
      FROM public.messages AS m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 1
    ) AS lm ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS cnt
      FROM public.messages AS m
      WHERE m.conversation_id = c.id
        AND m.read_at IS NULL
        AND m.sender_id <> (SELECT auth.uid())
    ) AS uc ON true
    LEFT JOIN LATERAL (
      SELECT t.status
      FROM public.transactions AS t
      WHERE t.listing_id = c.listing_id
        AND t.buyer_id = c.buyer_id
        AND t.seller_id = c.seller_id
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 1
    ) AS tx ON true
    WHERE (SELECT auth.uid()) IN (c.buyer_id, c.seller_id)
      AND NOT public.users_are_blocked(c.buyer_id, c.seller_id)
      AND (
        CASE WHEN p_archived
          THEN settings.archived_at IS NOT NULL
          ELSE settings.archived_at IS NULL
        END
      )
      AND (
        NULLIF(trim(p_search), '') IS NULL
        OR l.title ILIKE '%' || trim(p_search) || '%'
        OR p_b.username ILIKE '%' || trim(p_search) || '%'
        OR p_s.username ILIKE '%' || trim(p_search) || '%'
      )
  )
  SELECT inbox.*
  FROM inbox
  WHERE p_cursor_sort_at IS NULL
     OR (inbox.sort_at, inbox.id) < (p_cursor_sort_at, p_cursor_id)
  ORDER BY inbox.sort_at DESC, inbox.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_inbox(
  uuid, timestamptz, uuid, integer, text, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inbox(
  uuid, timestamptz, uuid, integer, text, boolean
) TO authenticated, service_role;

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

  IF public.users_are_blocked(v_buyer_id, v_seller_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: conversation blocked'
      USING ERRCODE = '42501';
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
