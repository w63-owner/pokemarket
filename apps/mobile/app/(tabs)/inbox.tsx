import { useCallback, useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";
import { router } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, Inbox, MessageCircle } from "lucide-react-native";

import {
  FEATURE_FLAGS,
  queryKeys,
  type ConversationPreview,
} from "@pokemarket/shared";
import { useAuth } from "@/hooks/use-auth";
import { useConversations } from "@/hooks/use-conversations";
import { usePresence } from "@/hooks/use-presence";
import {
  ConversationListItem,
  ConversationListItemSkeleton,
} from "@/components/messages";
import { TabHeader } from "@/components/layout";
import { AuthRequired, EmptyState, ErrorState } from "@/components/shared";
import { FeatureGate } from "@/components/feature-flags/feature-gate";
import { Button, Input } from "@/components/ui";
import { useThemeColor } from "@/lib/theme-colors";

function InboxContent() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const primary = useThemeColor("primary");
  const mutedForeground = useThemeColor("mutedForeground");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const {
    data,
    isLoading,
    isRefetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
    error,
  } = useConversations({ search, archived: showArchived });
  const conversations = useMemo(
    () => data?.pages.flatMap((page) => page.conversations) ?? [],
    [data],
  );

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
            size="icon"
            onPress={() => setShowArchived((value) => !value)}
            accessibilityLabel={
              showArchived
                ? "Afficher les conversations actives"
                : "Afficher les conversations archivées"
            }
          >
            {showArchived ? (
              <Inbox size={18} color={primary} />
            ) : (
              <Archive size={18} color={primary} />
            )}
          </Button>
        }
      />
      <View className="px-4 py-2">
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher une carte ou un membre"
          accessibilityLabel="Rechercher une conversation"
          returnKeyType="search"
        />
      </View>

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
      ) : conversations.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <EmptyState
            icon={<MessageCircle size={26} color={mutedForeground} />}
            title={search ? "Aucun résultat" : "Aucune conversation"}
            description={
              search
                ? "Essayez un autre nom de carte ou de membre."
                : showArchived
                  ? "Les conversations archivées apparaîtront ici."
                  : "Contactez un vendeur depuis une annonce pour démarrer une conversation."
            }
            action={
              search || showArchived
                ? undefined
                : {
                    label: "Explorer le marché",
                    onPress: () => router.push("/(tabs)"),
                  }
            }
          />
        </View>
      ) : (
        <FlashList
          data={conversations}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View>
                <ConversationListItemSkeleton />
                <ConversationListItemSkeleton />
              </View>
            ) : null
          }
          ItemSeparatorComponent={() => (
            <View className="h-[0.5px] bg-border" />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching && !isFetchingNextPage}
              onRefresh={refetch}
              tintColor={primary}
            />
          }
        />
      )}
    </View>
  );
}

export default function InboxScreen() {
  return (
    <FeatureGate flag={FEATURE_FLAGS.MESSAGING} name="La messagerie">
      <InboxContent />
    </FeatureGate>
  );
}
