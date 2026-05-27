/**
 * Deterministic Supabase Realtime channel names for the whole app.
 *
 * Centralising naming prevents typos that silently shard a single
 * logical channel into two (each costing a websocket connection) and
 * keeps the ref-counted registry in `hooks/use-realtime.ts` effective:
 * two call sites with the same `name(uid)` MUST resolve to the exact
 * same string for dedup to fire.
 */

export const channels = {
  /**
   * Unified inbox channel — listens to BOTH `messages` and
   * `conversations` changes for the current user, replacing the
   * previous trio of (unread-badge, inbox-messages, inbox-conversations)
   * channels with a single websocket subscription.
   */
  inbox: (userId: string) => `inbox:${userId}`,

  /**
   * Per-conversation thread channel — INSERT (new messages) + UPDATE
   * (read receipts) fused on a single channel via `event: "*"`.
   */
  thread: (conversationId: string) => `thread:${conversationId}`,

  /**
   * Per-user offers dashboard channel.
   */
  offersDashboard: (userId: string) => `offers-dashboard:${userId}`,

  /**
   * Global presence channel for the inbox "online now" indicator.
   */
  presence: () => "presence:inbox",
} as const;
