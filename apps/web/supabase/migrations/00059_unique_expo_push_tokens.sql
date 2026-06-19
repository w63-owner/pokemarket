-- 00059: Ensure one Expo push token can only target one account.
--
-- A shared device can legitimately be used by multiple accounts over time.
-- If logout cleanup fails while offline, a later login must transfer the token
-- to the new user rather than leaving the same device subscribed to both users.

WITH ranked_tokens AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY token
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS token_rank
  FROM public.expo_push_tokens
)
DELETE FROM public.expo_push_tokens AS token_rows
USING ranked_tokens
WHERE token_rows.id = ranked_tokens.id
  AND ranked_tokens.token_rank > 1;

ALTER TABLE public.expo_push_tokens
  ADD CONSTRAINT expo_push_tokens_token_key UNIQUE (token);
