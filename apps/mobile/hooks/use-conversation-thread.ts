import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { isSameDay, queryKeys, type Message } from "@pokemarket/shared";
import { useAuth } from "@/hooks/use-auth";
import {
  subscription,
  useRealtime,
  type RealtimePayload,
} from "@/hooks/use-realtime";
import { channels } from "@/lib/realtime/channels";
import {
  fetchConversationDetail,
  fetchMessages,
  markMessagesAsRead,
  sendImageMessage,
  sendMessage,
  type MessagesPage,
} from "@/lib/api/conversations";
import { fetchActiveOffer } from "@/lib/api/offers";
import { fetchTransactionByListing } from "@/lib/api/transactions";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui";

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

const OFFER_TYPES = new Set([
  "offer",
  "offer_accepted",
  "offer_rejected",
  "offer_cancelled",
  "offer_cancelled_by_buyer",
]);

const TX_TYPES = new Set([
  "payment_completed",
  "order_shipped",
  "sale_completed",
]);

// Consecutive bubbles from the same sender within this window are visually
// grouped (tight spacing, single tail) — the WhatsApp "burst" behaviour.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Lightweight snapshot of a quoted message, persisted inside the new
 * message's `metadata.reply_to`. We store a denormalised copy (content +
 * sender) so the quoted preview renders instantly without an extra join,
 * even if the original message is paginated out of memory.
 */
export interface ReplySnapshot {
  id: string;
  content: string;
  sender_id: string;
  message_type: string;
}

export function getReplySnapshot(message: Message): ReplySnapshot | null {
  const meta = message.metadata as Record<string, unknown> | null;
  const reply = meta?.reply_to as ReplySnapshot | undefined;
  if (reply && typeof reply.id === "string") return reply;
  return null;
}

export type ConversationRow =
  | {
      kind: "message";
      message: Message;
      isOwn: boolean;
      isPending: boolean;
      isFailed: boolean;
      isGroupStart: boolean;
      isLastInGroup: boolean;
    }
  | { kind: "system"; message: Message }
  | { kind: "date"; date: string; id: string };

/**
 * Whether two adjacent normal messages belong to the same visual group:
 * same sender, same day, neither is a system event, and sent close in time.
 */
function messagesGroup(a?: Message, b?: Message): boolean {
  if (!a || !b) return false;
  if (a.sender_id !== b.sender_id) return false;
  if (
    SYSTEM_TYPES.has(a.message_type ?? "") ||
    SYSTEM_TYPES.has(b.message_type ?? "")
  ) {
    return false;
  }
  if (!a.created_at || !b.created_at) return true;
  if (!isSameDay(a.created_at, b.created_at)) return false;
  return (
    Math.abs(
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ) <= GROUP_WINDOW_MS
  );
}

export function useConversationThread(conversationId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);
  // Temp IDs of optimistic messages whose send failed. They stay rendered
  // (so the user can tap to retry) but lose the "sending" clock.
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const unreadIdsRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const convQuery = useQuery({
    queryKey: queryKeys.conversations.detail(conversationId),
    queryFn: () => fetchConversationDetail(conversationId),
    enabled: !!user && !!conversationId,
  });

  const activeOfferQuery = useQuery({
    queryKey: queryKeys.offers.activeByConversation(conversationId),
    queryFn: () => fetchActiveOffer(conversationId),
    enabled: !!user && !!conversationId,
  });

  const transactionQuery = useQuery({
    queryKey: queryKeys.transactions.byListing(
      convQuery.data?.listing_id ?? "",
    ),
    queryFn: () => fetchTransactionByListing(convQuery.data!.listing_id),
    enabled: !!user && !!convQuery.data?.listing_id,
  });

  const messagesQuery = useInfiniteQuery({
    queryKey: queryKeys.conversations.messages(conversationId),
    queryFn: ({ pageParam }) => fetchMessages(conversationId, pageParam),
    initialPageParam: undefined as
      | { created_at: string; id: string }
      | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!user && !!conversationId,
  });

  const realMessages = useMemo(
    () => messagesQuery.data?.pages.flatMap((p) => p.messages) ?? [],
    [messagesQuery.data],
  );

  const allMessages = useMemo(
    () => [...pendingMessages, ...realMessages],
    [pendingMessages, realMessages],
  );

  const sendMutation = useMutation({
    mutationFn: ({
      content,
      clientId,
      replyTo,
    }: {
      content: string;
      clientId: string;
      replyTo?: ReplySnapshot | null;
    }) => sendMessage(conversationId, content, clientId, replyTo),
    onMutate: ({ content, clientId, replyTo }) => {
      const tempId = `temp-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
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
        } as unknown as Message["metadata"],
        read_at: null,
        created_at: new Date().toISOString(),
      };
      // A retry re-uses the same content; clear any stale failed flag.
      setFailedIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        next.delete(tempId);
        return next;
      });
      setPendingMessages((prev) => [tempMsg, ...prev]);
      return { tempId };
    },
    onSuccess: (data, _vars, ctx) => {
      haptic("success");
      setPendingMessages((prev) => prev.filter((m) => m.id !== ctx?.tempId));
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
    },
    onError: (_err, _vars, ctx) => {
      haptic("error");
      // Keep the optimistic bubble on screen and flag it as failed so the
      // user can tap to retry, instead of silently dropping the message.
      if (ctx?.tempId) {
        setFailedIds((prev) => new Set(prev).add(ctx.tempId));
      }
      toast.error("Échec de l'envoi du message");
    },
  });

  const sendImageMutation = useMutation({
    mutationFn: (payload: { uri: string; contentType: "image/jpeg" }) =>
      sendImageMessage(conversationId, payload),
    onMutate: () => {
      const tempId = `temp-img-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
      const tempMsg: Message = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user!.id,
        content: "",
        message_type: "image",
        offer_id: null,
        metadata: null,
        read_at: null,
        created_at: new Date().toISOString(),
      };
      setPendingMessages((prev) => [tempMsg, ...prev]);
      return { tempId };
    },
    onSuccess: (data, _vars, ctx) => {
      haptic("success");
      setPendingMessages((prev) => prev.filter((m) => m.id !== ctx?.tempId));
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
    },
    onError: (_err, _vars, ctx) => {
      haptic("error");
      setPendingMessages((prev) => prev.filter((m) => m.id !== ctx?.tempId));
      toast.error("Échec de l'envoi de l'image");
    },
  });

  const handleSendImage = useCallback(
    async (payload: { uri: string; contentType: "image/jpeg" }) => {
      await sendImageMutation.mutateAsync(payload);
    },
    [sendImageMutation],
  );

  const handleRealtimeInsert = useCallback(
    (payload: RealtimePayload<"messages">) => {
      const newMsg = payload.new as unknown as Message;

      if (newMsg.sender_id === user?.id) {
        setPendingMessages((prev) => {
          const incomingClientId = (
            newMsg.metadata as Record<string, unknown> | null
          )?.client_id;
          if (incomingClientId) {
            return prev.filter(
              (p) =>
                (p.metadata as Record<string, unknown> | null)?.client_id !==
                incomingClientId,
            );
          }
          const idx = prev.findIndex((p) => p.content === newMsg.content);
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

      if (newMsg.message_type && OFFER_TYPES.has(newMsg.message_type)) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.offers.activeByConversation(conversationId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.detail(conversationId),
        });
      }

      if (
        newMsg.message_type &&
        TX_TYPES.has(newMsg.message_type) &&
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
    [conversationId, queryClient, user?.id, convQuery.data?.listing_id],
  );

  const handleRealtimeUpdate = useCallback(
    (payload: RealtimePayload<"messages">) => {
      const updated = payload.new as unknown as Message;
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
              m.id === updated.id ? { ...m, read_at: updated.read_at } : m,
            ),
          })),
        };
      });
    },
    [conversationId, queryClient],
  );

  const threadSubs = useMemo(
    () => [
      subscription("messages", "*", {
        filter: `conversation_id=eq.${conversationId}`,
        onInsert: handleRealtimeInsert,
        onUpdate: handleRealtimeUpdate,
      }),
    ],
    [conversationId, handleRealtimeInsert, handleRealtimeUpdate],
  );

  useRealtime({
    channelName: channels.thread(conversationId),
    enabled: !!user && !!conversationId,
    subscriptions: threadSubs,
  });

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
                const [first, ...rest] = old.pages;
                return {
                  ...old,
                  pages: [
                    {
                      ...first,
                      messages: first.messages.map((m) =>
                        readSet.has(m.id)
                          ? { ...m, read_at: new Date().toISOString() }
                          : m,
                      ),
                    },
                    ...rest,
                  ],
                };
              });
              queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.unreadCount(),
              });
              queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.list(),
              });
            } catch {
              /* silently fail */
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
      for (const id of unreadSystemIds) handleMessageVisible(id);
    }
  }, [realMessages, user, handleMessageVisible]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  const handleSend = useCallback(
    (content: string, replyTo?: ReplySnapshot | null) => {
      const clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      sendMutation.mutate({ content, clientId, replyTo });
    },
    [sendMutation],
  );

  const handleRetry = useCallback(
    (message: Message) => {
      if (!message.content) return;
      const replyTo = getReplySnapshot(message);
      // Drop the failed optimistic bubble; the fresh attempt re-inserts one.
      setPendingMessages((prev) => prev.filter((m) => m.id !== message.id));
      setFailedIds((prev) => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
      const clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      sendMutation.mutate({ content: message.content, clientId, replyTo });
    },
    [sendMutation],
  );

  const rows = useMemo<ConversationRow[]>(() => {
    const pendingIds = new Set(pendingMessages.map((m) => m.id));
    const out: ConversationRow[] = [];

    // `allMessages` is newest-first (the thread renders inverted), so the
    // *older* neighbour sits at i+1 and the *newer* one at i-1.
    allMessages.forEach((msg, i) => {
      const older = allMessages[i + 1];
      const newer = allMessages[i - 1];
      const isLast = i === allMessages.length - 1;
      const showDate =
        isLast ||
        (older &&
          msg.created_at &&
          older.created_at &&
          !isSameDay(msg.created_at, older.created_at));

      if (SYSTEM_TYPES.has(msg.message_type ?? "")) {
        out.push({ kind: "system", message: msg });
      } else {
        const olderContinues = messagesGroup(msg, older);
        const newerContinues = messagesGroup(msg, newer);
        out.push({
          kind: "message",
          message: msg,
          isOwn: msg.sender_id === user?.id,
          isPending: pendingIds.has(msg.id) && !failedIds.has(msg.id),
          isFailed: failedIds.has(msg.id),
          // Visually top of the group → gets the extra spacing above.
          isGroupStart: !olderContinues,
          // Visually bottom of the group → keeps the tail + timestamp.
          isLastInGroup: !newerContinues,
        });
      }

      if (showDate && msg.created_at) {
        out.push({
          kind: "date",
          date: msg.created_at,
          id: `date-${msg.id}`,
        });
      }
    });

    return out;
  }, [allMessages, pendingMessages, failedIds, user?.id]);

  return {
    user,
    conversation: convQuery.data,
    activeOffer: activeOfferQuery.data ?? null,
    transaction: transactionQuery.data,
    rows,
    isConvLoading: convQuery.isLoading,
    isConvError: convQuery.error != null || convQuery.data == null,
    messagesQuery,
    handleSend,
    handleSendImage,
    handleRetry,
    handleMessageVisible,
    isSending: sendMutation.isPending,
  };
}
