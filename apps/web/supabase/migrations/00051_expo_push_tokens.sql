-- Sprint 8 (mobile native polish): Expo push tokens for the React Native app.
-- Mirrors the existing `push_subscriptions` table but stores Expo Push tokens
-- (e.g. "ExponentPushToken[xxx]") which are sent through Expo's push service
-- instead of Web Push. We keep the two tables separate so each transport stays
-- isolated and stale tokens for one transport don't pollute the other.

CREATE TABLE expo_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  device_id TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  app_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX expo_push_tokens_user_id_idx ON expo_push_tokens(user_id);

CREATE TRIGGER set_expo_push_tokens_updated_at
  BEFORE UPDATE ON expo_push_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE expo_push_tokens ENABLE ROW LEVEL SECURITY;

-- The mobile app upserts/reads/deletes its own tokens; service role used by the
-- Next.js backend bypasses RLS to fan out notifications.
CREATE POLICY "expo_push_tokens_select_own" ON expo_push_tokens
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "expo_push_tokens_insert_own" ON expo_push_tokens
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "expo_push_tokens_update_own" ON expo_push_tokens
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "expo_push_tokens_delete_own" ON expo_push_tokens
  FOR DELETE USING ((SELECT auth.uid()) = user_id);
