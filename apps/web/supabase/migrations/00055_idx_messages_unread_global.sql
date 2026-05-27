-- 00055: Per-recipient partial index for global unread counter
--
-- The mobile inbox tab calls `fetchUnreadCount()` which compiles to
-- roughly:
--
--   SELECT count(*) FROM messages
--   WHERE read_at IS NULL
--     AND sender_id <> $1                  -- the current user
--     -- + RLS: user is participant of the conversation
--
-- The existing `idx_messages_unread` (00017) is keyed on
-- `(conversation_id, sender_id, read_at) WHERE read_at IS NULL`. That
-- is great for per-thread queries but suboptimal for the inbox-wide
-- aggregation, which has no `conversation_id` predicate and ends up
-- bitmap-scanning every conversation. As the messages table grows past
-- a few hundred-k rows the EXPLAIN cost climbs linearly.
--
-- This new index is a *partial* index keyed on `sender_id` filtered to
-- `read_at IS NULL`. For an inbox-wide count we only need to scan the
-- (small) subset of unread messages, then filter `sender_id <> uid`.
--
-- We also add an INCLUDE on `conversation_id` so the index can answer
-- the query without touching the heap.
--
-- Other migrations in this project run inside a transaction, so this
-- one stays non-CONCURRENT for consistency. The acquired ACCESS EXCLUSIVE
-- lock is acceptable: the partial index is small (only unread rows) and
-- the messages table is still small enough at this stage of the product.

CREATE INDEX IF NOT EXISTS idx_messages_unread_by_sender
  ON public.messages (sender_id)
  INCLUDE (conversation_id)
  WHERE read_at IS NULL;
