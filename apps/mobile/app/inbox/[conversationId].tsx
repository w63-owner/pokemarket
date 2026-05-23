import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import { AlertCircle } from "lucide-react-native";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { queryKeys, type Message } from "@pokemarket/shared";
import { useAuth } from "@/hooks/use-auth";
import { useRealtime } from "@/hooks/use-realtime";
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
import {
  ListingContextBar,
  MessageBubble,
  MessageInput,
  OfferBar,
  SystemMessage,
  TransactionActions,
} from "@/components/messages";
import { MobileHeader } from "@/components/layout/mobile-header";
import { Skeleton, Text, toast } from "@/components/ui";

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

type Row =
  | { kind: "message"; message: Message; isOwn: boolean; isPending: boolean }
  | { kind: "system"; message: Message }
  | { kind: "date"; date: string; id: string };

export default function ConversationThreadScreen() {
  const params = useLocalSearchParams<{ conversationId: string }>();
  const conversationId = params.conversationId;
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

  // ── Send ──────────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: (content: string) => sendMessage(conversationId, content),
    onMutate: (content) => {
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
      toast.error("Échec de l'envoi du message");
    },
  });

  // ── Send image ─────────────────────────────────────────────────────────
  // Image attachments live in the private `message_attachments` bucket
  // (RLS scoped to conversation participants). The mutation uploads the
  // base64 payload then inserts a `message_type: "image"` row whose
  // `content` holds the storage path — `MessageBubble` mints a signed
  // URL on demand to render it.
  const sendImageMutation = useMutation({
    mutationFn: (payload: { base64: string; contentType: "image/jpeg" }) =>
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
    async (payload: { base64: string; contentType: "image/jpeg" }) => {
      await sendImageMutation.mutateAsync(payload);
    },
    [sendImageMutation],
  );

  // ── Realtime: new messages ────────────────────────────────────────────
  const handleRealtimeInsert = useCallback(
    (payload: { new: Record<string, unknown> }) => {
      const newMsg = payload.new as unknown as Message;

      if (newMsg.sender_id === user?.id) {
        setPendingMessages((prev) => {
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

  useRealtime({
    channelName: `thread-${conversationId}`,
    table: "messages",
    filter: `conversation_id=eq.${conversationId}`,
    event: "INSERT",
    onInsert: handleRealtimeInsert,
    enabled: !!user && !!conversationId,
  });

  // ── Realtime: read receipts ────────────────────────────────────────────
  const handleRealtimeUpdate = useCallback(
    (payload: { new: Record<string, unknown> }) => {
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

  useRealtime({
    channelName: `thread-reads-${conversationId}`,
    table: "messages",
    filter: `conversation_id=eq.${conversationId}`,
    event: "UPDATE",
    onUpdate: handleRealtimeUpdate,
    enabled: !!user && !!conversationId,
  });

  // ── Auto-read: batch mark as read every 2s ────────────────────────────
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
    (content: string) => {
      sendMutation.mutate(content);
    },
    [sendMutation],
  );

  // ── Build rows (date separators interleaved) for the inverted FlashList
  const rows = useMemo<Row[]>(() => {
    const pendingIds = new Set(pendingMessages.map((m) => m.id));
    const out: Row[] = [];

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

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      // Inverse transform compensates the parent FlashList's scaleY(-1)
      // (FlashList v2 removed the `inverted` prop, this preserves the
      // newest-at-bottom + onEndReached-loads-older semantics).
      const inner = (() => {
        if (item.kind === "date") {
          return (
            <View className="items-center py-2">
              <View className="rounded-full bg-muted/70 px-3 py-1">
                <Text className="text-[11px] font-medium text-muted-foreground">
                  {formatDateLabel(item.date)}
                </Text>
              </View>
            </View>
          );
        }
        if (item.kind === "system") {
          return <SystemMessage message={item.message} />;
        }
        return (
          <View className="px-3 py-0.5">
            <MessageBubble
              message={item.message}
              isOwn={item.isOwn}
              isPending={item.isPending}
              onVisible={handleMessageVisible}
            />
          </View>
        );
      })();

      return <View style={{ transform: [{ scaleY: -1 }] }}>{inner}</View>;
    },
    [handleMessageVisible],
  );

  if (!user || convQuery.isLoading) {
    return <ThreadSkeleton />;
  }

  if (convQuery.error || !convQuery.data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <AlertCircle size={28} color="#dc2626" />
        <Text variant="muted">Conversation introuvable</Text>
        <Pressable
          onPress={() => router.replace("/(tabs)/inbox")}
          className="mt-2 rounded-full bg-primary px-4 py-2"
        >
          <Text className="font-semibold text-primary-foreground">
            Retour aux messages
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const conversation = convQuery.data;

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["top", "left", "right"]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View>
        <MobileHeader
          variant="bare"
          fallbackHref="/(tabs)/inbox"
          centerTitle
          title={conversation.other_user.username}
          onTitlePress={() =>
            router.push(`/u/${conversation.other_user.username}`)
          }
        />

        <ListingContextBar listing={conversation.listing} />

        {transactionQuery.data ? (
          <TransactionActions
            transaction={transactionQuery.data}
            conversationId={conversationId}
            listingId={conversation.listing_id}
            currentUserId={user.id}
            sellerId={conversation.seller_id}
            buyerId={conversation.buyer_id}
          />
        ) : (
          <OfferBar
            conversation={conversation}
            activeOffer={activeOfferQuery.data ?? null}
            currentUser={user}
          />
        )}
      </View>

      {/* `react-native-keyboard-controller`'s KAV measures its own window
          position via `onLayout`, so we don't need a manual offset — any
          non-zero value would appear as a visible gap between the keyboard
          top and the MessageInput on Android. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View className="flex-1">
          {messagesQuery.isLoading ? (
            <MessagesSkeleton />
          ) : rows.length === 0 ? (
            <View className="flex-1 items-center justify-center px-6">
              <Text variant="muted">Envoyez le premier message !</Text>
            </View>
          ) : (
            <FlashList
              data={rows}
              renderItem={renderItem}
              keyExtractor={(item) =>
                item.kind === "date" ? item.id : item.message.id
              }
              style={{ transform: [{ scaleY: -1 }] }}
              contentContainerStyle={{ paddingVertical: 8 }}
              onEndReached={() => {
                if (
                  messagesQuery.hasNextPage &&
                  !messagesQuery.isFetchingNextPage
                ) {
                  messagesQuery.fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.5}
              refreshControl={
                // The list is rendered upside-down via `scaleY(-1)`, so the
                // pull arrow visually sits at the *top* of the chat (newest
                // messages) and triggers a full refetch — useful when realtime
                // missed an event or the user backgrounded the app for a long
                // time. Older messages still load via `onEndReached` (which
                // points at the visual top in inverted mode).
                <RefreshControl
                  refreshing={messagesQuery.isRefetching}
                  onRefresh={() => messagesQuery.refetch()}
                  tintColor="#E63946"
                  // Counter-rotate the spinner so it spins the right way
                  // inside the inverted FlashList.
                  style={{ transform: [{ scaleY: -1 }] }}
                />
              }
              ListFooterComponent={
                messagesQuery.isFetchingNextPage ? (
                  <View className="py-4">
                    <ActivityIndicator color="#E63946" />
                  </View>
                ) : null
              }
            />
          )}
        </View>

        <MessageInput
          onSend={handleSend}
          onSendImage={handleSendImage}
          disabled={sendMutation.isPending}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ThreadSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center gap-3 border-b border-border px-3 py-3">
        <Skeleton className="size-9 rounded-full" />
        <View className="flex-1 gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-2.5 w-40" />
        </View>
      </View>
      <View className="flex-1 gap-3 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <View
            key={i}
            className={`flex-row ${i % 3 === 0 ? "justify-start" : "justify-end"}`}
          >
            <Skeleton
              className="h-10 rounded-2xl"
              style={{ width: i % 2 === 0 ? 180 : 130 }}
            />
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

function MessagesSkeleton() {
  return (
    <View className="flex-1 gap-3 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <View
          key={i}
          className={`flex-row ${i % 3 === 0 ? "justify-start" : "justify-end"}`}
        >
          <Skeleton
            className="h-10 rounded-2xl"
            style={{ width: i % 2 === 0 ? 180 : 130 }}
          />
        </View>
      ))}
    </View>
  );
}
