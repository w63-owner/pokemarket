import { useCallback } from "react";
import { RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { MessageCircle, Tag } from "lucide-react-native";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import {
  queryKeys,
  type ConversationPreview,
  type Database,
} from "@pokemarket/shared";
import { useAuth } from "@/hooks/use-auth";
import { useConversations } from "@/hooks/use-conversations";
import { usePresence } from "@/hooks/use-presence";
import { useRealtime } from "@/hooks/use-realtime";
import { useTabBarScrollHandler } from "@/hooks/use-scroll-direction";
import {
  ConversationListItem,
  ConversationListItemSkeleton,
} from "@/components/messages";
import { Button, Text } from "@/components/ui";
import { useThemeColor } from "@/lib/theme-colors";

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

export default function InboxScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const primary = useThemeColor("primary");
  const {
    data: conversations,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useConversations();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.conversations.list() });
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.unreadCount(),
    });
  }, [queryClient]);

  const handleMessageInsert = useCallback(
    (payload: RealtimePostgresChangesPayload<MessageRow>) => {
      const newMsg = payload.new as MessageRow | undefined;
      if (newMsg?.sender_id === user?.id) return;
      invalidate();
    },
    [invalidate, user?.id],
  );

  useRealtime({
    channelName: `inbox-messages-${user?.id ?? "anon"}`,
    table: "messages",
    event: "INSERT",
    onInsert: handleMessageInsert,
    enabled: !!user,
  });

  useRealtime({
    channelName: `inbox-conversations-${user?.id ?? "anon"}`,
    table: "conversations",
    event: "*",
    onInsert: invalidate,
    onUpdate: invalidate,
    enabled: !!user,
  });

  const onlineIds = usePresence(user?.id);
  const onScroll = useTabBarScrollHandler();

  const renderItem = useCallback(
    ({ item, index }: { item: ConversationPreview; index: number }) => (
      <ConversationListItem
        conversation={item}
        currentUserId={user?.id ?? ""}
        index={index}
        isOnline={onlineIds.has(item.other_user.id)}
      />
    ),
    [user?.id, onlineIds],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center justify-between border-b border-border bg-background px-4 py-3">
        <Text variant="h2">Messages</Text>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => router.push("/offers")}
          leftIcon={<Tag size={16} color={primary} />}
        >
          Offres
        </Button>
      </View>

      {!user || isLoading ? (
        <View>
          {Array.from({ length: 6 }).map((_, i) => (
            <ConversationListItemSkeleton key={i} />
          ))}
        </View>
      ) : error ? (
        <EmptyState
          title="Erreur de chargement"
          description="Impossible de charger vos conversations. Réessayez."
          ctaLabel="Réessayer"
          onCta={invalidate}
        />
      ) : !conversations || conversations.length === 0 ? (
        <EmptyState
          title="Aucune conversation"
          description="Contactez un vendeur depuis une annonce pour démarrer une conversation."
          ctaLabel="Explorer le marché"
          onCta={() => router.push("/(tabs)")}
        />
      ) : (
        <FlashList
          data={conversations}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => (
            <View className="h-[0.5px] bg-border" />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={primary}
            />
          }
          onScroll={onScroll}
          scrollEventThrottle={16}
        />
      )}
    </SafeAreaView>
  );
}

function EmptyState({
  title,
  description,
  ctaLabel,
  onCta,
}: {
  title: string;
  description: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  const mutedForeground = useThemeColor("mutedForeground");
  return (
    <View className="flex-1 items-center justify-center gap-3 px-8">
      <View className="size-14 items-center justify-center rounded-full bg-muted">
        <MessageCircle size={26} color={mutedForeground} />
      </View>
      <Text variant="h4" className="text-center">
        {title}
      </Text>
      <Text variant="muted" className="text-center">
        {description}
      </Text>
      <Button onPress={onCta} className="mt-2">
        {ctaLabel}
      </Button>
    </View>
  );
}
