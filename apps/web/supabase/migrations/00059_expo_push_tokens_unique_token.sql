-- 00059: Make Expo push token ownership exclusive across users.
--
-- Expo push tokens identify an app install/device. If a logout-time DELETE is
-- missed and another account signs in on the same device, keeping one row per
-- (user_id, token) sends the old user's private notifications to the new user.
-- Keep the most recent owner for any existing duplicates, then enforce global
-- token uniqueness so future registrations transfer ownership atomically.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY token
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM public.expo_push_tokens
)
DELETE FROM public.expo_push_tokens AS tokens
USING ranked
WHERE tokens.id = ranked.id
  AND ranked.rn > 1;

ALTER TABLE public.expo_push_tokens
  DROP CONSTRAINT IF EXISTS expo_push_tokens_user_id_token_key;

ALTER TABLE public.expo_push_tokens
  ADD CONSTRAINT expo_push_tokens_token_key UNIQUE (token);
