-- Enable Supabase Realtime for messaging tables.
-- REPLICA IDENTITY FULL is required so that realtime server-side filters
-- (e.g. conversation_id=eq.xxx) can evaluate against non-PK columns.

ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE conversations REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
