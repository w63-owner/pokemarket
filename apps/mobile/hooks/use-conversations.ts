import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@pokemarket/shared";
import { useAuth } from "@/hooks/use-auth";
import { fetchConversations, fetchUnreadCount } from "@/lib/api/conversations";

/**
 * Conversations and unread count are kept fresh by the app-root
 * `useInboxChannel` realtime subscription (see
 * `hooks/use-inbox-channel.ts`), so we don't need a per-hook channel
 * or a poll interval — `staleTime` only controls how aggressively
 * background refetches re-fire when the user navigates back to the
 * inbox.
 */
export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations.list(),
    queryFn: fetchConversations,
    staleTime: 60_000,
  });
}

export function useUnreadCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.conversations.unreadCount(),
    queryFn: fetchUnreadCount,
    staleTime: 30_000,
    enabled: !!user,
  });
}
