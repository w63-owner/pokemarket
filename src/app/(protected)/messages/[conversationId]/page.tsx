"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
} from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
  useMutation,
} from "@tanstack/react-query";
import { m } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useInView } from "react-intersection-observer";

import { useAuth } from "@/hooks/use-auth";
import { useRealtime } from "@/hooks/use-realtime";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import {
  fetchConversationDetail,
  fetchMessages,
  sendMessage,
  markMessagesAsRead,
  type MessagesPage,
} from "@/lib/api/conversations";
import { fetchActiveOffer } from "@/lib/api/offers";
import { notifyUser } from "@/lib/api/push";
import { fetchTransactionByListing } from "@/lib/api/transactions";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageBubble } from "@/components/messages/message-bubble";
import { SystemMessage } from "@/components/messages/system-message";
import { MessageInput } from "@/components/messages/message-input";
import { OfferBar } from "@/components/messages/offer-bar";
import { TransactionActions } from "@/components/messages/transaction-actions";
import { ListingContextBar } from "@/components/messages/listing-context-bar";
import { SmartBackButton } from "@/components/ui/smart-back-button";
import type { Message } from "@/types";

const SYSTEM_TYPES = new Set([
  "system",
  "offer",
  "offer_accepted",
  "offer_rejected",
  "offer_cancelled",
  "offer_cancelled_by_buyer",
  "payment_completed",
  "order_shipped",
  "sale_completed",
]);

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / 86_400_000,
  );

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";

  return date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    ...(date.getFullYear() !== now.getFullYear() && { year: "numeric" }),
  });
}

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex justify-center py-2">
      <span className="bg-muted/70 text-muted-foreground rounded-full px-3 py-1 text-[11px] font-medium backdrop-blur-sm">
        {formatDateLabel(date)}
      </span>
    </div>
  );
}

export default function ConversationThreadPage() {
  const params = useParams<{ conversationId: string }>();
  const conversationId = params.conversationId;
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);

  const unreadIdsRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Conversation detail ──────────────────────────────────────────────
  const convQuery = useQuery({
    queryKey: queryKeys.conversations.detail(conversationId),
    queryFn: () => fetchConversationDetail(conversationId),
    enabled: !!user,
  });

  // ── Active offer for this conversation ────────────────────────────────
  const activeOfferQuery = useQuery({
    queryKey: queryKeys.offers.activeByConversation(conversationId),
    queryFn: () => fetchActiveOffer(conversationId),
    enabled: !!user,
  });

  // ── Transaction for this listing ────────────────────────────────────
  const transactionQuery = useQuery({
    queryKey: queryKeys.transactions.byListing(
      convQuery.data?.listing_id ?? "",
    ),
    queryFn: () => fetchTransactionByListing(convQuery.data!.listing_id),
    enabled: !!user && !!convQuery.data?.listing_id,
  });

  // ── Messages (infinite, newest first) ────────────────────────────────
  const messagesQuery = useInfiniteQuery({
    queryKey: queryKeys.conversations.messages(conversationId),
    queryFn: ({ pageParam }) => fetchMessages(conversationId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!user,
  });

  const realMessages = useMemo(
    () => messagesQuery.data?.pages.flatMap((p) => p.messages) ?? [],
    [messagesQuery.data],
  );

  const allMessages = useMemo(
    () => [...pendingMessages, ...realMessages],
    [pendingMessages, realMessages],
  );

  // ── Send mutation with optimistic UI ─────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: (content: string) => sendMessage(conversationId, content),
    onMutate: (content) => {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const tempMsg: Message = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user!.id,
        content,
        message_type: "text",
        offer_id: null,
        metadata: null,
        read_at: null,
        created_at: new Date().toISOString(),
      };
      setPendingMessages((prev) => [tempMsg, ...prev]);
      return { tempId };
    },
    onSuccess: (data, _variables, context) => {
      setPendingMessages((prev) =>
        prev.filter((m) => m.id !== context?.tempId),
      );
      queryClient.setQueryData<{
        pages: MessagesPage[];
        pageParams: unknown[];
      }>(queryKeys.conversations.messages(conversationId), (old) => {
        if (!old) return old;
        const exists = old.pages.some((p) =>
          p.messages.some((m) => m.id === data.id),
        );
        if (exists) return old;
        return {
          ...old,
          pages: old.pages.map((page, i) =>
            i === 0 ? { ...page, messages: [data, ...page.messages] } : page,
          ),
        };
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.list(),
      });

      if (convQuery.data?.other_user) {
        notifyUser(
          convQuery.data.other_user.id,
          "Nouveau message",
          data.content ?? "",
          `/messages/${conversationId}`,
        );
      }
    },
    onError: (error, _variables, context) => {
      setPendingMessages((prev) =>
        prev.filter((m) => m.id !== context?.tempId),
      );
      toast.error("Échec de l'envoi du message");
    },
  });

  // ── Realtime: new messages ───────────────────────────────────────────
  const handleRealtimeInsert = useCallback(
    (payload: { new: Record<string, unknown> }) => {
      const newMsg = payload.new as unknown as Message;

      if (newMsg.sender_id === user?.id) {
        setPendingMessages((prev) => {
          const idx = prev.findIndex((p) => p.sender_id === newMsg.sender_id);
          if (idx === -1) return prev;
          return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        });
      }

      queryClient.setQueryData<{
        pages: MessagesPage[];
        pageParams: unknown[];
      }>(queryKeys.conversations.messages(conversationId), (old) => {
        if (!old) return old;
        const exists = old.pages.some((p) =>
          p.messages.some((m) => m.id === newMsg.id),
        );
        if (exists) return old;
        return {
          ...old,
          pages: old.pages.map((page, i) =>
            i === 0 ? { ...page, messages: [newMsg, ...page.messages] } : page,
          ),
        };
      });

      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.list(),
      });

      const offerTypes = new Set([
        "offer",
        "offer_accepted",
        "offer_rejected",
        "offer_cancelled",
        "offer_cancelled_by_buyer",
      ]);
      if (offerTypes.has(newMsg.message_type)) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.offers.activeByConversation(conversationId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.detail(conversationId),
        });
      }

      const txTypes = new Set([
        "payment_completed",
        "order_shipped",
        "sale_completed",
      ]);
      if (txTypes.has(newMsg.message_type) && convQuery.data?.listing_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.transactions.byListing(convQuery.data.listing_id),
        });
      }
    },
    [conversationId, queryClient, user?.id, convQuery.data],
  );

  useRealtime({
    channelName: `thread-${conversationId}`,
    table: "messages",
    filter: `conversation_id=eq.${conversationId}`,
    event: "INSERT",
    onInsert: handleRealtimeInsert,
    enabled: !!user,
  });

  // ── Realtime: read receipts ──────────────────────────────────────────
  const handleRealtimeUpdate = useCallback(
    (payload: { new: Record<string, unknown> }) => {
      const updatedMsg = payload.new as unknown as Message;
      queryClient.setQueryData<{
        pages: MessagesPage[];
        pageParams: unknown[];
      }>(queryKeys.conversations.messages(conversationId), (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) =>
              m.id === updatedMsg.id
                ? { ...m, read_at: updatedMsg.read_at }
                : m,
            ),
          })),
        };
      });
    },
    [conversationId, queryClient],
  );

  useRealtime({
    channelName: `thread-reads-${conversationId}`,
    table: "messages",
    filter: `conversation_id=eq.${conversationId}`,
    event: "UPDATE",
    onUpdate: handleRealtimeUpdate,
    enabled: !!user,
  });

  // ── Auto-read: batch mark as read every 2s ──────────────────────────
  const handleMessageVisible = useCallback(
    (messageId: string) => {
      unreadIdsRef.current.add(messageId);

      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(async () => {
          const ids = Array.from(unreadIdsRef.current);
          unreadIdsRef.current.clear();
          flushTimerRef.current = null;

          if (ids.length > 0) {
            try {
              await markMessagesAsRead(ids);
              queryClient.setQueryData<{
                pages: MessagesPage[];
                pageParams: unknown[];
              }>(queryKeys.conversations.messages(conversationId), (old) => {
                if (!old) return old;
                const readSet = new Set(ids);
                return {
                  ...old,
                  pages: old.pages.map((page) => ({
                    ...page,
                    messages: page.messages.map((m) =>
                      readSet.has(m.id)
                        ? { ...m, read_at: new Date().toISOString() }
                        : m,
                    ),
                  })),
                };
              });
              queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.unreadCount(),
              });
              queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.list(),
              });
            } catch {
              /* silently fail for read marking */
            }
          }
        }, 2000);
      }
    },
    [conversationId, queryClient],
  );

  useEffect(() => {
    if (!user) return;
    const unreadSystemIds = realMessages
      .filter(
        (m) =>
          SYSTEM_TYPES.has(m.message_type) &&
          !m.read_at &&
          m.sender_id !== user.id,
      )
      .map((m) => m.id);

    if (unreadSystemIds.length > 0) {
      for (const id of unreadSystemIds) {
        handleMessageVisible(id);
      }
    }
  }, [realMessages, user, handleMessageVisible]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  // ── Infinite scroll sentinel ─────────────────────────────────────────
  const { ref: sentinelRef } = useInView({
    onChange: (inView) => {
      if (
        inView &&
        messagesQuery.hasNextPage &&
        !messagesQuery.isFetchingNextPage
      ) {
        messagesQuery.fetchNextPage();
      }
    },
  });

  // ── Send handler ─────────────────────────────────────────────────────
  const handleSend = useCallback(
    (content: string) => {
      sendMutation.mutate(content);
    },
    [sendMutation],
  );

  // ── Loading ──────────────────────────────────────────────────────────
  if (!user || convQuery.isLoading) {
    return <ThreadSkeleton />;
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (convQuery.error) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-4">
        <AlertCircle className="text-destructive size-8" />
        <p className="text-muted-foreground text-sm">
          Conversation introuvable
        </p>
        <SmartBackButton
          fallbackUrl="/messages"
          variant="secondary"
          label="Retour aux messages"
        />
      </div>
    );
  }

  const conversation = convQuery.data!;
  const pendingIds = new Set(pendingMessages.map((m) => m.id));

  return (
    <div className="flex h-dvh flex-col">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="border-border bg-background/80 sticky top-0 z-10 border-b pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="flex items-center gap-3 px-2 py-2.5">
          <SmartBackButton fallbackUrl="/messages" />

          <div className="min-w-0 flex-1 text-center">
            <Link
              href={`/u/${conversation.other_user.username}`}
              className="hover:text-brand truncate text-sm font-semibold transition-colors"
            >
              {conversation.other_user.username}
            </Link>
          </div>

          {/* Spacer to balance the back button for centering */}
          <div className="w-9 shrink-0" />
        </div>

        <ListingContextBar listing={conversation.listing} />
      </header>

      {/* ── Transaction / Offer bar ─────────────────────────────── */}
      {user && conversation && transactionQuery.data ? (
        <TransactionActions
          transaction={transactionQuery.data}
          conversationId={conversationId}
          listingId={conversation.listing_id}
          currentUser={user}
          sellerId={conversation.seller_id}
          buyerId={conversation.buyer_id}
        />
      ) : user && conversation ? (
        <OfferBar
          conversation={conversation}
          activeOffer={activeOfferQuery.data ?? null}
          currentUser={user}
        />
      ) : null}

      {/* ── Messages ───────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col-reverse gap-1 overflow-y-auto overscroll-contain px-2 py-3">
        {messagesQuery.isLoading ? (
          <MessagesSkeleton />
        ) : allMessages.length === 0 ? (
          <m.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-muted-foreground py-20 text-center text-sm"
          >
            Envoyez le premier message !
          </m.p>
        ) : (
          <>
            {allMessages.map((msg, i) => {
              const nextMsg = allMessages[i + 1];
              const showDate =
                i === allMessages.length - 1 ||
                (nextMsg && !isSameDay(msg.created_at, nextMsg.created_at));

              return (
                <Fragment key={msg.id}>
                  {SYSTEM_TYPES.has(msg.message_type) ? (
                    <SystemMessage message={msg} />
                  ) : (
                    <MessageBubble
                      message={msg}
                      isOwn={msg.sender_id === user.id}
                      isPending={pendingIds.has(msg.id)}
                      onVisible={handleMessageVisible}
                    />
                  )}
                  {showDate && <DateSeparator date={msg.created_at} />}
                </Fragment>
              );
            })}

            {messagesQuery.isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <div className="border-muted-foreground/40 border-t-muted-foreground size-5 animate-spin rounded-full border-2" />
              </div>
            )}

            {messagesQuery.hasNextPage && (
              <div ref={sentinelRef} className="h-px" />
            )}
          </>
        )}
      </div>

      {/* ── Input ──────────────────────────────────────────────────── */}
      <MessageInput onSend={handleSend} disabled={sendMutation.isPending} />
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex h-dvh flex-col">
      <header className="border-border flex items-center gap-3 border-b px-2 py-2.5">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="size-9 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-2.5 w-40" />
        </div>
      </header>
      <div className="flex-1 space-y-3 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              i % 3 === 0 ? "justify-start" : "justify-end",
            )}
          >
            <Skeleton
              className={cn("h-10 rounded-2xl", i % 2 === 0 ? "w-48" : "w-36")}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function MessagesSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={cn("flex", i % 3 === 0 ? "justify-start" : "justify-end")}
        >
          <Skeleton
            className={cn("h-10 rounded-2xl", i % 2 === 0 ? "w-48" : "w-32")}
          />
        </div>
      ))}
    </>
  );
}
