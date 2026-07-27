-- 00058: One Expo push token belongs to one user at a time.
--
-- The previous UNIQUE (user_id, token) constraint allowed the same physical
-- device token to remain attached to multiple accounts. After an incomplete
-- logout unregister (or a shared-device account switch), the next user kept
-- receiving the previous user's private commerce/message pushes.

WITH ranked_tokens AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY token
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM public.expo_push_tokens
)
DELETE FROM public.expo_push_tokens e
USING ranked_tokens r
WHERE e.id = r.id
  AND r.rn > 1;

ALTER TABLE public.expo_push_tokens
  DROP CONSTRAINT IF EXISTS expo_push_tokens_user_id_token_key;

ALTER TABLE public.expo_push_tokens
  ADD CONSTRAINT expo_push_tokens_token_key UNIQUE (token);
