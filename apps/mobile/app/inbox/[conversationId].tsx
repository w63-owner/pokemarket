import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { MotiView, AnimatePresence } from "moti";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import { AlertCircle, ChevronDown, MessageCircle } from "lucide-react-native";

import { formatDateLabel, type Message } from "@pokemarket/shared";
import {
  useConversationThread,
  type ConversationRow,
  type ReplySnapshot,
} from "@/hooks/use-conversation-thread";
import {
  ImageLightbox,
  ListingContextBar,
  MessageActionsSheet,
  MessageBubble,
  MessageInput,
  OfferBar,
  SystemMessage,
  TransactionActions,
} from "@/components/messages";
import { MobileHeader } from "@/components/layout/mobile-header";
import { EmptyState } from "@/components/shared";
import { Skeleton, Text } from "@/components/ui";
import { spring } from "@/lib/motion";
import { useThemeColors } from "@/lib/theme-colors";

function toReplySnapshot(message: Message): ReplySnapshot {
  return {
    id: message.id,
    content: message.content ?? "",
    sender_id: message.sender_id,
    message_type: message.message_type ?? "text",
  };
}

export default function ConversationThreadScreen() {
  const params = useLocalSearchParams<{ conversationId: string }>();
  const conversationId = params.conversationId;
  const colors = useThemeColors();

  const {
    user,
    conversation,
    activeOffer,
    transaction,
    rows,
    isConvLoading,
    isConvError,
    messagesQuery,
    handleSend,
    handleSendImage,
    handleRetry,
    handleMessageVisible,
    isSending,
  } = useConversationThread(conversationId);

  const listRef = useRef<FlashListRef<ConversationRow>>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplySnapshot | null>(null);
  const [actionsMessage, setActionsMessage] = useState<Message | null>(null);
  const [lightboxPath, setLightboxPath] = useState<string | null>(null);

  const otherUsername = conversation?.other_user.username ?? "";
  const currentUserId = user?.id ?? "";

  const handleLongPress = useCallback((message: Message) => {
    setActionsMessage(message);
  }, []);

  const handleReply = useCallback((message: Message) => {
    setReplyingTo(toReplySnapshot(message));
  }, []);

  const handleSendWithReply = useCallback(
    (content: string) => {
      handleSend(content, replyingTo);
      setReplyingTo(null);
    },
    [handleSend, replyingTo],
  );

  const renderItem = useCallback(
    ({ item }: { item: ConversationRow }) => {
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
          <View
            className="px-3"
            style={{ marginTop: item.isGroupStart ? 8 : 2 }}
          >
            <MessageBubble
              message={item.message}
              isOwn={item.isOwn}
              isPending={item.isPending}
              isFailed={item.isFailed}
              isLastInGroup={item.isLastInGroup}
              currentUserId={currentUserId}
              otherUsername={otherUsername}
              onVisible={handleMessageVisible}
              onRetry={handleRetry}
              onLongPress={handleLongPress}
              onImagePress={setLightboxPath}
            />
          </View>
        );
      })();

      return <View style={{ transform: [{ scaleY: -1 }] }}>{inner}</View>;
    },
    [
      handleMessageVisible,
      handleRetry,
      handleLongPress,
      currentUserId,
      otherUsername,
    ],
  );

  if (!user || isConvLoading) {
    return <ThreadSkeleton />;
  }

  if (isConvError || !conversation) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <AlertCircle size={28} color={colors.destructive} />
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

        {transaction ? (
          <TransactionActions
            transaction={transaction}
            conversationId={conversationId}
            listingId={conversation.listing_id}
            currentUserId={user.id}
            sellerId={conversation.seller_id}
            buyerId={conversation.buyer_id}
          />
        ) : (
          <OfferBar
            conversation={conversation}
            activeOffer={activeOffer}
            currentUser={user}
          />
        )}
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View className="flex-1">
          {messagesQuery.isLoading ? (
            <MessagesSkeleton />
          ) : rows.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <EmptyState
                icon={
                  <MessageCircle size={28} color={colors.mutedForeground} />
                }
                title="Brisez la glace"
                description="Envoyez le premier message pour démarrer la conversation."
              />
            </View>
          ) : (
            <FlashList
              ref={listRef}
              data={rows}
              renderItem={renderItem}
              keyExtractor={(item) =>
                item.kind === "date" ? item.id : item.message.id
              }
              style={{ transform: [{ scaleY: -1 }] }}
              contentContainerStyle={{ paddingVertical: 8 }}
              onScroll={(e) => {
                // Inverted list: offset 0 == newest (bottom). Reveal the
                // jump-to-latest pill once the user scrolls into history.
                const next = e.nativeEvent.contentOffset.y > 240;
                setShowScrollDown((prev) => (prev === next ? prev : next));
              }}
              scrollEventThrottle={16}
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
                <RefreshControl
                  refreshing={messagesQuery.isRefetching}
                  onRefresh={() => messagesQuery.refetch()}
                  tintColor={colors.primary}
                  style={{ transform: [{ scaleY: -1 }] }}
                />
              }
              ListFooterComponent={
                messagesQuery.isFetchingNextPage ? (
                  <View className="py-4">
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : null
              }
            />
          )}

          <AnimatePresence>
            {showScrollDown ? (
              <MotiView
                from={{ opacity: 0, scale: 0.8, translateY: 8 }}
                animate={{ opacity: 1, scale: 1, translateY: 0 }}
                exit={{ opacity: 0, scale: 0.8, translateY: 8 }}
                transition={spring.snappy}
                style={{ position: "absolute", right: 12, bottom: 12 }}
              >
                <Pressable
                  onPress={() =>
                    listRef.current?.scrollToOffset({
                      offset: 0,
                      animated: true,
                    })
                  }
                  accessibilityLabel="Aller au dernier message"
                  className="size-10 items-center justify-center rounded-full border border-border bg-card shadow-lg"
                >
                  <ChevronDown size={22} color={colors.foreground} />
                </Pressable>
              </MotiView>
            ) : null}
          </AnimatePresence>
        </View>

        <MessageInput
          onSend={handleSendWithReply}
          onSendImage={handleSendImage}
          disabled={isSending}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          currentUserId={currentUserId}
          otherUsername={otherUsername}
        />
      </KeyboardAvoidingView>

      <MessageActionsSheet
        message={actionsMessage}
        onClose={() => setActionsMessage(null)}
        onReply={handleReply}
      />

      <ImageLightbox
        storagePath={lightboxPath}
        onClose={() => setLightboxPath(null)}
      />
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
