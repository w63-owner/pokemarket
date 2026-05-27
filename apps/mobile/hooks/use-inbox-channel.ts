import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@pokemarket/shared";

import {
  subscription,
  useRealtime,
  type Subscription,
} from "@/hooks/use-realtime";
import { channels } from "@/lib/realtime/channels";

/**
 * App-root realtime subscription for everything inbox-related — mounted
 * once in `_layout.tsx` so the tab badge, the conversations list and
 * the unread counter all share a single websocket.
 *
 * Replaces three previously independent channels:
 *   1. `unread-badge-<uid>`           (was in `useUnreadCount`)
 *   2. `inbox-messages-<uid>`         (was in `(tabs)/inbox.tsx`)
 *   3. `inbox-conversations-<uid>`    (was in `(tabs)/inbox.tsx`)
 *
 * Why mount at the root and not on the inbox tab: the bottom-tab unread
 * badge is rendered persistently and needs realtime invalidation even
 * when the user has never opened the inbox tab. Mounting once at the
 * root keeps the websocket alive across tab transitions instead of
 * thrashing it on every navigation.
 */
export function useInboxChannel(userId: string | null | undefined) {
  const queryClient = useQueryClient();

  const invalidateInbox = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.conversations.list() });
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.unreadCount(),
    });
  }, [queryClient]);

  // Filter on the server: conversations Realtime supports column
  // equality filters but not OR across columns, so we register two
  // subscriptions on the same channel — one for the buyer side and
  // one for the seller side. The registry dedupes the underlying
  // websocket and dispatches both `.on()` listeners through the same
  // socket.
  //
  // For `messages`, there is no `recipient_id` column to filter on, so
  // we rely on RLS to scope the firehose to messages the current user
  // can actually see (i.e. messages in conversations they are part of).
  // This is documented as a known cost in the audit — acceptable while
  // a typical user is in <100 active threads.
  const subscriptions = useMemo<Subscription[]>(() => {
    if (!userId) return [];
    return [
      subscription("messages", "INSERT", {
        // `payload.new` is typed as `MessageRow | {}` because of the
        // union with DELETE payloads; cast to the specific table row
        // since we know this listener only fires for INSERTs.
        onInsert: (payload) => {
          const row = payload.new as { sender_id?: string } | undefined;
          if (!row) return;
          if (row.sender_id === userId) return;
          invalidateInbox();
        },
      }),
      subscription("conversations", "*", {
        filter: `buyer_id=eq.${userId}`,
        onInsert: invalidateInbox,
        onUpdate: invalidateInbox,
      }),
      subscription("conversations", "*", {
        filter: `seller_id=eq.${userId}`,
        onInsert: invalidateInbox,
        onUpdate: invalidateInbox,
      }),
    ];
  }, [userId, invalidateInbox]);

  useRealtime({
    channelName: userId ? channels.inbox(userId) : "inbox:anon",
    enabled: !!userId,
    subscriptions,
  });
}
