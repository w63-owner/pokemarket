import { useCallback, useMemo } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { queryKeys, type Database, type InboxCursor } from "@deckdealr/shared";
import { useAuth } from "@/hooks/use-auth";
import { subscription, useRealtime } from "@/hooks/use-realtime";
import {
  fetchConversations,
  fetchUnreadCount,
  type InboxFilters,
} from "@/lib/api/conversations";
import { channels } from "@/lib/realtime/channels";

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

export function useConversations(filters: InboxFilters = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.conversations.list(filters),
    queryFn: ({ pageParam }) => fetchConversations(filters, pageParam),
    initialPageParam: undefined as InboxCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30_000,
  });
}

export function useUnreadCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.conversations.unreadCount(),
    queryFn: fetchUnreadCount,
    staleTime: 15_000,
    refetchInterval: 60_000,
    enabled: !!user,
  });
}

/**
 * Subscribes to realtime INSERTs on `messages` and invalidates the unread
 * count query when a new message arrives from someone else.
 *
 * MUST be mounted at most once per browser tab. The Supabase realtime client
 * deduplicates channels by topic, so a second mount with the same channel
 * name throws "cannot add postgres_changes callbacks after subscribe()" — that
 * uncaught throw crashes the React root and triggers global-error.tsx.
 * Mount it from the top-level `Providers` component, never from leaf UI
 * (Header / TabBar both render `useUnreadCount` and would collide otherwise).
 */
export function useUnreadCountSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleInsert = useCallback(
    (payload: RealtimePostgresChangesPayload<MessageRow>) => {
      const row = (payload.new ?? payload.old) as MessageRow | undefined;
      if (!row) return;
      if (row.sender_id === user?.id) return;

      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.unreadCount(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.list(),
      });
    },
    [queryClient, user?.id],
  );

  const invalidateInbox = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.unreadCount(),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.list(),
    });
  }, [queryClient]);

  const inboxSubscriptions = useMemo(
    () => [
      subscription("messages", "INSERT", { onInsert: handleInsert }),
      subscription("conversations", "*", {
        onInsert: invalidateInbox,
        onUpdate: invalidateInbox,
        onDelete: invalidateInbox,
      }),
    ],
    [handleInsert, invalidateInbox],
  );

  useRealtime({
    channelName: channels.inbox(user?.id ?? "anon"),
    subscriptions: inboxSubscriptions,
    enabled: !!user,
  });
}
