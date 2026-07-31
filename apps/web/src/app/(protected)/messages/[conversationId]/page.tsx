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
import { AlertCircle, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";
import { useInView } from "react-intersection-observer";

import { useAuth } from "@/hooks/use-auth";
import { useRealtime, type Subscription } from "@/hooks/use-realtime";
import {
  applyMessageReadReceipt,
  formatDateLabel,
  isSameDay,
  prependMessageIfMissing,
  reconcileOptimisticMessages,
} from "@pokemarket/shared";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import {
  fetchConversationDetail,
  fetchMessages,
  markMessagesAsRead,
  sendImageMessage,
  sendTextMessage,
  type MessagesPage,
} from "@/lib/api/conversations";
import { fetchActiveOffer } from "@/lib/api/offers";
import { fetchTransactionByListing } from "@/lib/api/transactions";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "@/components/messages/message-bubble";
import { SystemMessage } from "@/components/messages/system-message";
import { MessageInput } from "@/components/messages/message-input";
import {
  createMessageClientId,
  getReplySnapshot,
  messagesGroup,
  toReplySnapshot,
  type ReplySnapshot,
} from "@/components/messages/message-thread-utils";
import { OfferBar } from "@/components/messages/offer-bar";
import { TransactionActions } from "@/components/messages/transaction-actions";
import { ListingContextBar } from "@/components/messages/listing-context-bar";
import { SmartBackButton } from "@/components/ui/smart-back-button";
import { channels } from "@/lib/realtime/channels";
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
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<ReplySnapshot | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const [isAwayFromLatest, setIsAwayFromLatest] = useState(false);

  const unreadIdsRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

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
    initialPageParam: undefined as
      | { created_at: string; id: string }
      | undefined,
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
    mutationFn: async ({
      content,
      clientId,
      replyTo,
    }: {
      content: string;
      clientId: string;
      replyTo?: ReplySnapshot | null;
    }) => sendTextMessage(conversationId, content, clientId, replyTo),
    onMutate: ({ content, clientId, replyTo }) => {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const tempMsg: Message = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user!.id,
        content,
        message_type: "text",
        offer_id: null,
        metadata: {
          client_id: clientId,
          ...(replyTo ? { reply_to: replyTo } : {}),
        },
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
      if (context?.tempId) {
        setFailedIds((prev) => {
          const next = new Set(prev);
          next.delete(context.tempId);
          return next;
        });
      }
      queryClient.setQueryData<{
        pages: MessagesPage[];
        pageParams: unknown[];
      }>(queryKeys.conversations.messages(conversationId), (old) =>
        prependMessageIfMissing(old, data),
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.list(),
      });
    },
    onError: (error, _variables, context) => {
      Sentry.captureException(error, {
        tags: { component: "messaging", operation: "send", client: "web" },
      });
      if (context?.tempId) {
        setFailedIds((prev) => new Set(prev).add(context.tempId));
      }
      toast.error("Échec de l'envoi du message");
    },
  });

  const sendImageMutation = useMutation({
    mutationFn: ({ file, clientId }: { file: File; clientId: string }) =>
      sendImageMessage(conversationId, file, clientId),
    onSuccess: (data) => {
      queryClient.setQueryData<{
        pages: MessagesPage[];
        pageParams: unknown[];
      }>(queryKeys.conversations.messages(conversationId), (old) =>
        prependMessageIfMissing(old, data),
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.list(),
      });
    },
    onError: (error) => {
      Sentry.captureException(error, {
        tags: {
          component: "messaging",
          operation: "send-image",
          client: "web",
        },
      });
    },
  });

  // ── Realtime: new messages ───────────────────────────────────────────
  const handleRealtimeInsert = useCallback(
    (payload: { new: Record<string, unknown> }) => {
      const newMsg = payload.new as unknown as Message;

      if (newMsg.sender_id === user?.id) {
        setPendingMessages((prev) => reconcileOptimisticMessages(prev, newMsg));
      } else {
        setLiveAnnouncement(
          newMsg.message_type === "image"
            ? "Nouveau message image"
            : `Nouveau message : ${newMsg.content ?? ""}`,
        );
        if (!isAwayFromLatest) {
          requestAnimationFrame(() => {
            threadRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          });
        }
      }

      queryClient.setQueryData<{
        pages: MessagesPage[];
        pageParams: unknown[];
      }>(queryKeys.conversations.messages(conversationId), (old) =>
        prependMessageIfMissing(old, newMsg),
      );

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
      if (newMsg.message_type && offerTypes.has(newMsg.message_type)) {
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
      if (
        newMsg.message_type &&
        txTypes.has(newMsg.message_type) &&
        convQuery.data?.listing_id
      ) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.transactions.byListing(convQuery.data.listing_id),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.detail(conversationId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.offers.activeByConversation(conversationId),
        });
      }
    },
    [conversationId, queryClient, user?.id, convQuery.data, isAwayFromLatest],
  );

  // ── Realtime: read receipts ──────────────────────────────────────────
  const handleRealtimeUpdate = useCallback(
    (payload: { new: Record<string, unknown> }) => {
      const updatedMsg = payload.new as unknown as Message;
      queryClient.setQueryData<{
        pages: MessagesPage[];
        pageParams: unknown[];
      }>(queryKeys.conversations.messages(conversationId), (old) =>
        applyMessageReadReceipt(old, updatedMsg),
      );
    },
    [conversationId, queryClient],
  );

  const threadSubscriptions: Subscription[] = [
    {
      table: "messages",
      event: "*",
      filter: `conversation_id=eq.${conversationId}`,
      onInsert: handleRealtimeInsert,
      onUpdate: handleRealtimeUpdate,
    },
  ];

  useRealtime({
    channelName: channels.thread(conversationId),
    subscriptions: threadSubscriptions,
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
          !!m.message_type &&
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
    (content: string, replyTo?: ReplySnapshot | null) => {
      sendMutation.mutate({
        content,
        clientId: createMessageClientId(),
        replyTo,
      });
    },
    [sendMutation],
  );

  const handleSendImage = useCallback(
    async (file: File) => {
      await sendImageMutation.mutateAsync({
        file,
        clientId: createMessageClientId(),
      });
    },
    [sendImageMutation],
  );

  const handleRetry = useCallback(
    (message: Message) => {
      if (!message.content) return;
      Sentry.addBreadcrumb({
        category: "messaging",
        level: "info",
        message: "message_retry",
        data: { message_type: message.message_type },
      });
      setPendingMessages((prev) =>
        prev.filter((pending) => pending.id !== message.id),
      );
      setFailedIds((prev) => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
      sendMutation.mutate({
        content: message.content,
        clientId: createMessageClientId(),
        replyTo: getReplySnapshot(message),
      });
    },
    [sendMutation],
  );

  const handleCopy = useCallback(async (message: Message) => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success("Message copié");
    } catch {
      toast.error("Impossible de copier le message");
    }
  }, []);

  const handleThreadScroll = useCallback(() => {
    setIsAwayFromLatest(Math.abs(threadRef.current?.scrollTop ?? 0) > 160);
  }, []);

  const scrollToLatest = useCallback(() => {
    threadRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setIsAwayFromLatest(false);
  }, []);

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
    <div className="relative flex h-dvh min-h-0 flex-col lg:h-[calc(100dvh-4rem)]">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </p>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="border-border bg-background/80 sticky top-0 z-10 border-b pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <SmartBackButton
            fallbackUrl="/messages"
            className="min-h-0 min-w-0"
          />

          <div className="min-w-0 flex-1 text-center">
            <Link
              href={`/u/${conversation.other_user.username}`}
              className="hover:text-brand truncate text-sm font-semibold transition-colors"
            >
              {conversation.other_user.username}
            </Link>
          </div>

          {/* Spacer to balance the back button for centering */}
          <div className="size-8 shrink-0" />
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
      <div
        ref={threadRef}
        onScroll={handleThreadScroll}
        className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain px-2 py-3"
        aria-label="Historique de la conversation"
      >
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
              const olderMessage = allMessages[i + 1];
              const newerMessage = allMessages[i - 1];
              const showDate =
                i === allMessages.length - 1 ||
                (olderMessage &&
                  msg.created_at &&
                  olderMessage.created_at &&
                  !isSameDay(msg.created_at, olderMessage.created_at));

              return (
                <Fragment key={msg.id}>
                  {SYSTEM_TYPES.has(msg.message_type ?? "") ? (
                    <SystemMessage message={msg} />
                  ) : (
                    <MessageBubble
                      message={msg}
                      isOwn={msg.sender_id === user.id}
                      isPending={pendingIds.has(msg.id)}
                      isFailed={failedIds.has(msg.id)}
                      isGroupStart={!messagesGroup(msg, olderMessage)}
                      isLastInGroup={!messagesGroup(msg, newerMessage)}
                      currentUserId={user.id}
                      otherUsername={conversation.other_user.username}
                      onVisible={handleMessageVisible}
                      onRetry={handleRetry}
                      onReply={(message) =>
                        setReplyingTo(toReplySnapshot(message))
                      }
                      onCopy={handleCopy}
                    />
                  )}
                  {showDate && msg.created_at && (
                    <DateSeparator date={msg.created_at} />
                  )}
                </Fragment>
              );
            })}

            {messagesQuery.isFetchingNextPage && (
              <div
                className="space-y-2 py-4"
                aria-label="Chargement des messages précédents"
              >
                <Skeleton className="ml-4 h-9 w-40 rounded-2xl" />
                <Skeleton className="mr-4 ml-auto h-12 w-52 rounded-2xl" />
                <Skeleton className="ml-4 h-9 w-32 rounded-2xl" />
              </div>
            )}

            {messagesQuery.hasNextPage && (
              <div ref={sentinelRef} className="h-px" />
            )}
          </>
        )}
      </div>

      {isAwayFromLatest && (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute right-4 bottom-20 z-10 rounded-full shadow-lg"
          onClick={scrollToLatest}
          aria-label="Revenir au dernier message"
        >
          <ArrowDown className="size-4" />
        </Button>
      )}

      {/* ── Input ──────────────────────────────────────────────────── */}
      <MessageInput
        onSend={handleSend}
        onSendImage={handleSendImage}
        disabled={sendMutation.isPending || sendImageMutation.isPending}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        currentUserId={user.id}
        otherUsername={conversation.other_user.username}
      />
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex h-dvh min-h-0 flex-col lg:h-[calc(100dvh-4rem)]">
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
