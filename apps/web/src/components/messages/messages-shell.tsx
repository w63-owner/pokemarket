"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useConversations } from "@/hooks/use-conversations";
import {
  ConversationList,
  ConversationListSkeleton,
} from "@/components/messages/conversation-list";
import { Input } from "@/components/ui/input";

export function MessagesShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const conversationsQuery = useConversations({ search });
  const conversations = useMemo(
    () =>
      conversationsQuery.data?.pages.flatMap((page) => page.conversations) ??
      [],
    [conversationsQuery.data],
  );
  const hasSelectedConversation = /^\/messages\/[^/]+/.test(pathname);

  if (!hasSelectedConversation) return children;

  return (
    <div className="lg:grid lg:h-[calc(100dvh-4rem)] lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className="border-border hidden min-h-0 overflow-y-auto border-r lg:block">
        <div className="bg-background/90 sticky top-0 z-10 border-b p-3 backdrop-blur-md">
          <h1 className="font-display mb-3 text-xl font-bold">Messages</h1>
          <label className="relative block">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <span className="sr-only">Rechercher une conversation</span>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher"
              className="pl-9"
            />
          </label>
        </div>
        {!user || conversationsQuery.isLoading ? (
          <ConversationListSkeleton />
        ) : (
          <ConversationList
            conversations={conversations}
            currentUserId={user.id}
          />
        )}
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
