-- Retention cron batches must only return image attachments that still exist
-- in Storage. Otherwise each batch reselects the same message rows after the
-- objects were deleted, and unique progress stalls at STORAGE_BATCH_SIZE per run.

CREATE OR REPLACE FUNCTION public.get_expired_message_attachment_paths(
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
    AND EXISTS (
      SELECT 1
      FROM storage.objects AS o
      WHERE o.bucket_id = 'message_attachments'
        AND o.name = m.content
    )
  ORDER BY m.created_at, m.id
  LIMIT LEAST(GREATEST(p_limit, 1), 1000);
$$;
