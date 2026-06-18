-- Ensure one physical Expo install can only be assigned to one user account.
-- Keep the most recently updated row for any token that was already duplicated
-- by the previous (user_id, token) uniqueness rule.
DELETE FROM expo_push_tokens old_token
USING expo_push_tokens kept_token
WHERE old_token.token = kept_token.token
  AND old_token.id <> kept_token.id
  AND (
    old_token.updated_at < kept_token.updated_at
    OR (
      old_token.updated_at = kept_token.updated_at
      AND old_token.id < kept_token.id
    )
  );

ALTER TABLE expo_push_tokens
  DROP CONSTRAINT IF EXISTS expo_push_tokens_user_id_token_key;

ALTER TABLE expo_push_tokens
  ADD CONSTRAINT expo_push_tokens_token_key UNIQUE (token);
