"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchConversations, fetchUnreadCount } from "@/lib/api/conversations";
import { useAuth } from "@/hooks/use-auth";
import { useRealtime } from "@/hooks/use-realtime";

export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations.list(),
    queryFn: fetchConversations,
    staleTime: 30_000,
  });
}

export function useUnreadCount() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.unreadCount(),
    });
  }, [queryClient]);

  useRealtime({
    channelName: `unread-badge-${user?.id ?? "anon"}`,
    table: "messages",
    event: "*",
    onInsert: invalidate,
    onUpdate: invalidate,
    enabled: !!user,
  });

  return useQuery({
    queryKey: queryKeys.conversations.unreadCount(),
    queryFn: fetchUnreadCount,
    staleTime: 15_000,
    refetchInterval: 60_000,
    enabled: !!user,
  });
}
