import { useState } from "react";
import { View } from "react-native";
import { Heart } from "lucide-react-native";

import { useAuth } from "@/hooks/use-auth";
import { useFavoriteListings } from "@/hooks/use-favorites";
import { useSavedSearchNewCounts } from "@/hooks/use-saved-searches";
import { FeedGrid } from "@/components/feed/feed-grid";
import { SavedSearchesList } from "@/components/favorites/saved-searches-list";
import { FollowedSellersList } from "@/components/favorites/followed-sellers-list";
import { TabHeader } from "@/components/layout";
import { AuthRequired, EmptyState } from "@/components/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
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

  // Never render the favorites content while we don't have a confirmed
  // authenticated user — otherwise the grid/tabs would flash for a frame
  // before the AuthRequired empty state appears.
  if (!user) {
    return (
      <View className="flex-1 bg-background">
        <TabHeader title="Favoris" />
        {authLoading ? null : (
          <View className="flex-1 items-center justify-center">
            <AuthRequired
              icon={<Heart size={28} color={primary} />}
              title="Connecte-toi pour voir tes favoris"
              description="Sauvegarde des cartes, suis des vendeurs et crée des alertes de recherche."
            />
          </View>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <TabHeader title="Favoris" />
      <Tabs
        value={tab}
        onValueChange={(next) => setTab(next as TabKey)}
        variant="line"
        swipeable
        fill
      >
        <View className="border-b border-border bg-background px-4 pb-1 pt-2">
          <TabsList>
            <TabsTrigger value="listings">Annonces</TabsTrigger>
            <TabsTrigger value="sellers">Vendeurs</TabsTrigger>
            <TabsTrigger value="saved-searches">
              {totalNew > 0 ? `Recherches (${totalNew})` : "Recherches"}
            </TabsTrigger>
          </TabsList>
        </View>

        <TabsContent value="listings">
          {hasNoListings ? (
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
          )}
        </TabsContent>

        <TabsContent value="sellers">
          <FollowedSellersList />
        </TabsContent>

        <TabsContent value="saved-searches">
          <SavedSearchesList />
        </TabsContent>
      </Tabs>
    </View>
  );
}
