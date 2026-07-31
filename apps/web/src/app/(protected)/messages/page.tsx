"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, Inbox, MessageCircle, Search } from "lucide-react";
import { useInView } from "react-intersection-observer";
import { useAuth } from "@/hooks/use-auth";
import { useConversations } from "@/hooks/use-conversations";
import { queryKeys } from "@/lib/query-keys";
import {
  ConversationList,
  ConversationListSkeleton,
} from "@/components/messages/conversation-list";
import { AuthRequired } from "@/components/shared/auth-required";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "200px" });
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useConversations({ search, archived: showArchived });
  const conversations = useMemo(
    () => data?.pages.flatMap((page) => page.conversations) ?? [],
    [data],
  );

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, inView, isFetchingNextPage]);

  const invalidateConversations = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.list(),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.unreadCount(),
    });
  }, [queryClient]);

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <header className="border-border bg-background/80 sticky top-0 z-10 border-b px-4 pt-6 pb-3 backdrop-blur-md">
          <h1 className="font-display text-2xl font-bold">Messages</h1>
        </header>
        {authLoading ? (
          <ConversationListSkeleton />
        ) : (
          <AuthRequired
            icon={<MessageCircle className="size-6" />}
            title="Connectez-vous pour accéder à la messagerie"
            description="Discutez avec les vendeurs et les acheteurs depuis votre compte."
            next="/messages"
          />
        )}
      </div>
    );
  }

  if (isLoading) {
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
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold">Messages</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowArchived((value) => !value)}
          >
            {showArchived ? (
              <Inbox className="size-4" />
            ) : (
              <Archive className="size-4" />
            )}
            {showArchived ? "Actives" : "Archivées"}
          </Button>
        </div>
        <label className="relative mt-3 block">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <span className="sr-only">Rechercher une conversation</span>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une carte ou un membre"
            className="pl-9"
          />
        </label>
      </header>

      {hasConversations ? (
        <>
          <ConversationList
            conversations={conversations}
            currentUserId={user.id}
          />
          <div ref={loadMoreRef} className="p-4" aria-live="polite">
            {isFetchingNextPage ? <ConversationListSkeleton /> : null}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<MessageCircle className="size-6" />}
          title={search ? "Aucun résultat" : "Aucune conversation"}
          description={
            search
              ? "Essayez un autre nom de carte ou de membre."
              : showArchived
                ? "Les conversations archivées apparaîtront ici."
                : "Vos futures transactions commenceront ici. Contactez un vendeur depuis une annonce pour démarrer !"
          }
          action={
            search || showArchived
              ? undefined
              : { label: "Explorer le marché", href: "/" }
          }
        />
      )}
    </div>
  );
}
