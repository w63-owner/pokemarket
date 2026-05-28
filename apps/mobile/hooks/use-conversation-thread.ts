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

export type ConversationRow =
  | { kind: "message"; message: Message; isOwn: boolean; isPending: boolean }
  | { kind: "system"; message: Message }
  | { kind: "date"; date: string; id: string };

export function useConversationThread(conversationId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);

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
    }: {
      content: string;
      clientId: string;
    }) => sendMessage(conversationId, content, clientId),
    onMutate: ({ content, clientId }) => {
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
        metadata: { client_id: clientId },
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

  const flushPendingReadReceipts = useCallback(async () => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const ids = Array.from(unreadIdsRef.current);
    unreadIdsRef.current.clear();

    if (ids.length === 0) return;

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
  }, [conversationId, queryClient]);

  const handleMessageVisible = useCallback(
    (messageId: string) => {
      unreadIdsRef.current.add(messageId);

      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(() => {
          void flushPendingReadReceipts();
        }, 2000);
      }
    },
    [flushPendingReadReceipts],
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
      void flushPendingReadReceipts();
    };
  }, [flushPendingReadReceipts]);

  const handleSend = useCallback(
    (content: string) => {
      const clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      sendMutation.mutate({ content, clientId });
    },
    [sendMutation],
  );

  const rows = useMemo<ConversationRow[]>(() => {
    const pendingIds = new Set(pendingMessages.map((m) => m.id));
    const out: ConversationRow[] = [];

    allMessages.forEach((msg, i) => {
      const next = allMessages[i + 1];
      const isLast = i === allMessages.length - 1;
      const showDate =
        isLast ||
        (next &&
          msg.created_at &&
          next.created_at &&
          !isSameDay(msg.created_at, next.created_at));

      if (SYSTEM_TYPES.has(msg.message_type ?? "")) {
        out.push({ kind: "system", message: msg });
      } else {
        out.push({
          kind: "message",
          message: msg,
          isOwn: msg.sender_id === user?.id,
          isPending: pendingIds.has(msg.id),
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
  }, [allMessages, pendingMessages, user?.id]);

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
    handleMessageVisible,
    isSending: sendMutation.isPending,
  };
}
