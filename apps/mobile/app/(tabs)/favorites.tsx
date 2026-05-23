import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Heart } from "lucide-react-native";

import { useAuth } from "@/hooks/use-auth";
import { useFavoriteListings } from "@/hooks/use-favorites";
import { useSavedSearchNewCounts } from "@/hooks/use-saved-searches";
import { FeedGrid } from "@/components/feed/feed-grid";
import { SavedSearchesList } from "@/components/favorites/saved-searches-list";
import { FollowedSellersList } from "@/components/favorites/followed-sellers-list";
import { AuthRequired, EmptyState } from "@/components/shared";
import { Tabs, TabsList, TabsTrigger, Text } from "@/components/ui";
import { useThemeColor } from "@/lib/theme-colors";

type TabKey = "listings" | "sellers" | "saved-searches";

export default function FavoritesScreen() {
  const [tab, setTab] = useState<TabKey>("listings");
  const { user, loading: authLoading } = useAuth();
  const {
    data: favorites = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useFavoriteListings();
  const { totalNew } = useSavedSearchNewCounts();
  const primary = useThemeColor("primary");

  const hasNoListings = !isLoading && !isError && favorites.length === 0;

  if (!authLoading && !user) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="border-b border-border bg-background px-4 pb-1 pt-2">
          <Text variant="h2">Favoris</Text>
        </View>
        <View className="flex-1 items-center justify-center">
          <AuthRequired
            icon={<Heart size={28} color="#E63946" />}
            title="Connecte-toi pour voir tes favoris"
            description="Sauvegarde des cartes, suis des vendeurs et crée des alertes de recherche."
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="border-b border-border bg-background px-4 pb-1 pt-2">
        <Text variant="h2" className="mb-3">
          Favoris
        </Text>

        <Tabs
          value={tab}
          onValueChange={(next) => setTab(next as TabKey)}
          variant="line"
        >
          <TabsList>
            <TabsTrigger value="listings">Annonces</TabsTrigger>
            <TabsTrigger value="sellers">Vendeurs</TabsTrigger>
            <TabsTrigger value="saved-searches">
              {totalNew > 0 ? `Recherches (${totalNew})` : "Recherches"}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </View>

      <View className="flex-1">
        {tab === "listings" ? (
          hasNoListings ? (
            <View className="flex-1 items-center justify-center">
              <EmptyState
                icon={<Heart size={28} color={primary} />}
                title="Aucun favori"
                description="Ajoute des cartes à tes favoris depuis le feed pour les retrouver ici."
              />
            </View>
          ) : (
            <FeedGrid
              data={favorites}
              loading={isLoading}
              refreshing={isRefetching}
              onRefresh={refetch}
              emptyTitle="Aucun favori"
              emptyMessage="Ajoute des cartes à tes favoris depuis le feed."
              error={
                isError
                  ? {
                      message:
                        error instanceof Error
                          ? error.message
                          : "Impossible de charger les favoris.",
                      onRetry: () => refetch(),
                    }
                  : undefined
              }
            />
          )
        ) : tab === "sellers" ? (
          <FollowedSellersList />
        ) : (
          <SavedSearchesList />
        )}
      </View>
    </SafeAreaView>
  );
}
