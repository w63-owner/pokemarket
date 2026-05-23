"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchConversations, fetchUnreadCount } from "@/lib/api/conversations";
import { useAuth } from "@/hooks/use-auth";
import { useRealtime } from "@/hooks/use-realtime";
import type { Database } from "@/types/database";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations.list(),
    queryFn: fetchConversations,
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

  const handleChange = useCallback(
    (payload: RealtimePostgresChangesPayload<MessageRow>) => {
      const row = (payload.new ?? payload.old) as MessageRow | undefined;
      if (!row) return;
      if (row.sender_id === user?.id) return;

      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.unreadCount(),
      });
    },
    [queryClient, user?.id],
  );

  useRealtime({
    channelName: `unread-badge-${user?.id ?? "anon"}`,
    table: "messages",
    event: "INSERT",
    onInsert: handleChange,
    enabled: !!user,
  });
}
