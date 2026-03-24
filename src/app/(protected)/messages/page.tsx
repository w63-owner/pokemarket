"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useConversations } from "@/hooks/use-conversations";
import { useRealtime } from "@/hooks/use-realtime";
import { queryKeys } from "@/lib/query-keys";
import {
  ConversationList,
  ConversationListSkeleton,
} from "@/components/messages/conversation-list";
import { EmptyState } from "@/components/shared/empty-state";

export default function MessagesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: conversations, isLoading, error } = useConversations();

  const invalidateConversations = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.list(),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.unreadCount(),
    });
  }, [queryClient]);

  useRealtime({
    channelName: `inbox-messages-${user?.id ?? "anon"}`,
    table: "messages",
    event: "INSERT",
    onInsert: invalidateConversations,
    enabled: !!user,
  });

  useRealtime({
    channelName: `inbox-conversations-${user?.id ?? "anon"}`,
    table: "conversations",
    event: "*",
    onInsert: invalidateConversations,
    onUpdate: invalidateConversations,
    enabled: !!user,
  });

  if (isLoading || !user) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <header className="border-border bg-background/80 sticky top-0 z-10 border-b px-4 pt-6 pb-3 backdrop-blur-md">
          <h1 className="font-display text-2xl font-bold">Messages</h1>
        </header>
        <ConversationListSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <header className="border-border bg-background/80 sticky top-0 z-10 border-b px-4 pt-6 pb-3 backdrop-blur-md">
          <h1 className="font-display text-2xl font-bold">Messages</h1>
        </header>
        <EmptyState
          icon={<MessageCircle className="size-6" />}
          title="Erreur de chargement"
          description="Impossible de charger vos conversations. Veuillez réessayer."
          action={{ label: "Réessayer", onClick: invalidateConversations }}
        />
      </div>
    );
  }

  const hasConversations = conversations && conversations.length > 0;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="border-border bg-background/80 sticky top-0 z-10 border-b px-4 pt-6 pb-3 backdrop-blur-md">
        <h1 className="font-display text-2xl font-bold">Messages</h1>
      </header>

      {hasConversations ? (
        <ConversationList
          conversations={conversations}
          currentUserId={user.id}
        />
      ) : (
        <EmptyState
          icon={<MessageCircle className="size-6" />}
          title="Aucune conversation"
          description="Vos futures transactions commenceront ici. Contactez un vendeur depuis une annonce pour démarrer !"
          action={{ label: "Explorer le marché", href: "/" }}
        />
      )}
    </div>
  );
}
