-- Sprint 3: scalable inbox, participant controls, moderation and retention.

CREATE TABLE public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX user_blocks_blocked_idx
  ON public.user_blocks (blocked_id, blocker_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_blocks_select_own"
  ON public.user_blocks FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = blocker_id);

CREATE POLICY "user_blocks_insert_own"
  ON public.user_blocks FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = blocker_id);

CREATE POLICY "user_blocks_delete_own"
  ON public.user_blocks FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = blocker_id);

CREATE TABLE public.conversation_participant_settings (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  archived_at timestamptz,
  muted_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX conversation_settings_user_inbox_idx
  ON public.conversation_participant_settings (user_id, archived_at, conversation_id);

ALTER TABLE public.conversation_participant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_settings_participant_select"
  ON public.conversation_participant_settings FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.conversations AS c
      WHERE c.id = conversation_id
        AND (SELECT auth.uid()) IN (c.buyer_id, c.seller_id)
    )
  );

CREATE POLICY "conversation_settings_participant_insert"
  ON public.conversation_participant_settings FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.conversations AS c
      WHERE c.id = conversation_id
        AND (SELECT auth.uid()) IN (c.buyer_id, c.seller_id)
    )
  );

CREATE POLICY "conversation_settings_participant_update"
  ON public.conversation_participant_settings FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.conversations AS c
      WHERE c.id = conversation_id
        AND (SELECT auth.uid()) IN (c.buyer_id, c.seller_id)
    )
  );

CREATE TABLE public.conversation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (
    reason IN ('spam', 'harassment', 'scam', 'inappropriate', 'other')
  ),
  description text CHECK (
    description IS NULL OR char_length(description) BETWEEN 10 AND 1000
  ),
  message_snapshot jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'reviewed', 'resolved', 'dismissed')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX conversation_reports_message_once_idx
  ON public.conversation_reports (reporter_id, message_id)
  WHERE message_id IS NOT NULL;

CREATE UNIQUE INDEX conversation_reports_conversation_once_idx
  ON public.conversation_reports (reporter_id, conversation_id)
  WHERE message_id IS NULL;

CREATE INDEX conversation_reports_moderation_queue_idx
  ON public.conversation_reports (status, created_at);

ALTER TABLE public.conversation_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_reports_insert_own"
  ON public.conversation_reports FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = reporter_id
    AND EXISTS (
      SELECT 1
      FROM public.conversations AS c
      WHERE c.id = conversation_id
        AND (SELECT auth.uid()) IN (c.buyer_id, c.seller_id)
    )
    AND (
      message_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.messages AS m
        WHERE m.id = message_id
          AND m.conversation_id = conversation_id
      )
    )
  );

CREATE POLICY "conversation_reports_select_own"
  ON public.conversation_reports FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = reporter_id);

CREATE FUNCTION public.capture_reported_message_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.message_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', m.id,
      'sender_id', m.sender_id,
      'content', m.content,
      'message_type', m.message_type,
      'created_at', m.created_at
    )
    INTO NEW.message_snapshot
    FROM public.messages AS m
    WHERE m.id = NEW.message_id
      AND m.conversation_id = NEW.conversation_id;
  ELSE
    NEW.message_snapshot := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_reported_message_snapshot() FROM PUBLIC;
CREATE TRIGGER capture_reported_message_snapshot
  BEFORE INSERT ON public.conversation_reports
  FOR EACH ROW EXECUTE FUNCTION public.capture_reported_message_snapshot();

-- A block in either direction prevents direct client inserts. The server
-- messaging endpoint mirrors this check because service_role bypasses RLS.
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
        AND NOT EXISTS (
          SELECT 1
          FROM public.user_blocks AS b
          WHERE (b.blocker_id = c.buyer_id AND b.blocked_id = c.seller_id)
             OR (b.blocker_id = c.seller_id AND b.blocked_id = c.buyer_id)
        )
    )
  );

-- Stable keyset pagination. p_user_id remains for generated-client backwards
-- compatibility but is deliberately ignored in favour of auth.uid().
DROP FUNCTION IF EXISTS public.get_inbox(uuid);

CREATE FUNCTION public.get_inbox(
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
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_blocks AS b
        WHERE (b.blocker_id = c.buyer_id AND b.blocked_id = c.seller_id)
           OR (b.blocker_id = c.seller_id AND b.blocked_id = c.buyer_id)
      )
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

CREATE INDEX conversations_buyer_created_idx
  ON public.conversations (buyer_id, created_at DESC, id DESC);
CREATE INDEX conversations_seller_created_idx
  ON public.conversations (seller_id, created_at DESC, id DESC);
CREATE INDEX transactions_conversation_status_idx
  ON public.transactions (listing_id, buyer_id, seller_id, created_at DESC);

-- Service-only helpers let the application cron delete Storage objects before
-- deleting retained message rows. They are invoker functions, not definer
-- functions in an exposed schema.
CREATE FUNCTION public.get_expired_message_attachment_paths(
  p_before timestamptz,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (message_id uuid, storage_path text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT m.id, m.content
  FROM public.messages AS m
  WHERE m.message_type = 'image'
    AND m.created_at < p_before
    AND m.content IS NOT NULL
  ORDER BY m.created_at, m.id
  LIMIT LEAST(GREATEST(p_limit, 1), 1000);
$$;

CREATE FUNCTION public.delete_expired_messages(
  p_before timestamptz,
  p_limit integer DEFAULT 5000
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count bigint;
BEGIN
  WITH expired AS (
    SELECT m.id
    FROM public.messages AS m
    WHERE m.created_at < p_before
      AND (
        m.message_type <> 'image'
        OR NOT EXISTS (
          SELECT 1
          FROM storage.objects AS o
          WHERE o.bucket_id = 'message_attachments'
            AND o.name = m.content
        )
      )
    ORDER BY m.created_at, m.id
    LIMIT LEAST(GREATEST(p_limit, 1), 10000)
  )
  DELETE FROM public.messages AS m
  USING expired
  WHERE m.id = expired.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE FUNCTION public.get_orphaned_message_attachment_paths(
  p_before timestamptz,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (storage_path text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT o.name
  FROM storage.objects AS o
  WHERE o.bucket_id = 'message_attachments'
    AND o.created_at < p_before
    AND NOT EXISTS (
      SELECT 1
      FROM public.messages AS m
      WHERE m.message_type = 'image'
        AND m.content = o.name
    )
  ORDER BY o.created_at, o.id
  LIMIT LEAST(GREATEST(p_limit, 1), 1000);
$$;

REVOKE ALL ON FUNCTION public.get_expired_message_attachment_paths(
  timestamptz, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_expired_messages(
  timestamptz, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_orphaned_message_attachment_paths(
  timestamptz, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_expired_message_attachment_paths(
  timestamptz, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_expired_messages(
  timestamptz, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_orphaned_message_attachment_paths(
  timestamptz, integer
) TO service_role;

-- Operational account-erasure procedure. Financial and transaction records
-- retain the opaque UUID for legal traceability while direct profile data and
-- non-essential account data are removed. Auth session revocation/deletion is
-- intentionally performed through the Supabase Admin API after this procedure.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE PROCEDURE private.anonymize_account(p_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles
  SET username = 'deleted_' || substr(replace(p_user_id::text, '-', ''), 1, 20),
      avatar_url = NULL,
      country_code = NULL,
      bio = NULL,
      instagram_url = NULL,
      facebook_url = NULL,
      tiktok_url = NULL,
      address_line = NULL,
      city = NULL,
      postal_code = NULL,
      updated_at = now()
  WHERE id = p_user_id;

  DELETE FROM public.push_subscriptions WHERE user_id = p_user_id;
  DELETE FROM public.expo_push_tokens WHERE user_id = p_user_id;
  DELETE FROM public.notification_preferences WHERE user_id = p_user_id;
  DELETE FROM public.saved_searches WHERE user_id = p_user_id;
  DELETE FROM public.favorites WHERE user_id = p_user_id;
  DELETE FROM public.favorite_sellers
  WHERE user_id = p_user_id OR seller_id = p_user_id;
  DELETE FROM public.user_blocks
  WHERE blocker_id = p_user_id OR blocked_id = p_user_id;
  DELETE FROM public.conversation_participant_settings WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON PROCEDURE private.anonymize_account(uuid)
  FROM PUBLIC, anon, authenticated;
