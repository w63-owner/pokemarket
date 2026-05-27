import { useCallback } from "react";
import { RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Tag } from "lucide-react-native";

import { queryKeys, type ConversationPreview } from "@pokemarket/shared";
import { useAuth } from "@/hooks/use-auth";
import { useConversations } from "@/hooks/use-conversations";
import { usePresence } from "@/hooks/use-presence";
import {
  ConversationListItem,
  ConversationListItemSkeleton,
} from "@/components/messages";
import { TabHeader } from "@/components/layout";
import { AuthRequired, EmptyState, ErrorState } from "@/components/shared";
import { Button } from "@/components/ui";
import { useThemeColor } from "@/lib/theme-colors";

export default function InboxScreen() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const primary = useThemeColor("primary");
  const mutedForeground = useThemeColor("mutedForeground");
  const {
    data: conversations,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useConversations();

  // Realtime is centralised in `useInboxChannel` (mounted in
  // `app/_layout.tsx`), so this screen only needs a manual invalidator
  // for the "retry" button on the error state.
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.conversations.list() });
    queryClient.invalidateQueries({
      queryKey: queryKeys.conversations.unreadCount(),
    });
  }, [queryClient]);

  const onlineIds = usePresence(user?.id);

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

  // Never render the conversations list while we don't have a confirmed
  // authenticated user — otherwise the inbox header/skeletons would flash
  // for a frame before the AuthRequired empty state appears.
  if (!user) {
    return (
      <View className="flex-1 bg-background">
        <TabHeader title="Messages" />
        {authLoading ? null : (
          <View className="flex-1 items-center justify-center">
            <AuthRequired
              icon={<MessageCircle size={28} color={primary} />}
              title="Connecte-toi pour accéder à la messagerie"
              description="Discute avec les vendeurs et acheteurs depuis ton compte."
            />
          </View>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <TabHeader
        title="Messages"
        right={
          <Button
            variant="ghost"
            size="sm"
            onPress={() => router.push("/offers")}
            leftIcon={<Tag size={16} color={primary} />}
          >
            Offres
          </Button>
        }
      />

      {isLoading ? (
        <View>
          {Array.from({ length: 6 }).map((_, i) => (
            <ConversationListItemSkeleton key={i} />
          ))}
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-6">
          <ErrorState
            title="Erreur de chargement"
            description="Impossible de charger vos conversations. Réessayez."
            action={{ label: "Réessayer", onPress: invalidate }}
          />
        </View>
      ) : !conversations || conversations.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <EmptyState
            icon={<MessageCircle size={26} color={mutedForeground} />}
            title="Aucune conversation"
            description="Contactez un vendeur depuis une annonce pour démarrer une conversation."
            action={{
              label: "Explorer le marché",
              onPress: () => router.push("/(tabs)"),
            }}
          />
        </View>
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
        />
      )}
    </View>
  );
}
