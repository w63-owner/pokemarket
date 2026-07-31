-- Make client-generated message IDs idempotent across retries and reconnects.
WITH duplicate_client_ids AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY conversation_id, sender_id, metadata ->> 'client_id'
      ORDER BY created_at, id
    ) AS occurrence
  FROM public.messages
  WHERE metadata ->> 'client_id' IS NOT NULL
)
UPDATE public.messages AS messages
SET metadata = messages.metadata - 'client_id'
FROM duplicate_client_ids
WHERE messages.id = duplicate_client_ids.id
  AND duplicate_client_ids.occurrence > 1;

CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_client_id_unique
  ON public.messages (
    conversation_id,
    sender_id,
    (metadata ->> 'client_id')
  )
  WHERE metadata ->> 'client_id' IS NOT NULL;

-- Keep the category contract identical on web, mobile and the push dispatcher.
ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_category_check;

ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_category_check
  CHECK (
    category IN (
      'messages',
      'offers',
      'commerce',
      'saved_searches',
      'following'
    )
  );
