import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Heart } from "lucide-react-native";
import { useFavoriteListings } from "@/hooks/use-favorites";
import { FeedGrid } from "@/components/feed/feed-grid";
import { Text } from "@/components/ui";

export default function FavoritesScreen() {
  const {
    data: favorites = [],
    isLoading,
    refetch,
    isRefetching,
  } = useFavoriteListings();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="border-b border-border bg-background px-4 pb-3 pt-2">
        <Text variant="h2">Favoris</Text>
      </View>

      {!isLoading && favorites.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Heart size={28} color="#E63946" />
          </View>
          <Text variant="h4">Aucun favori</Text>
          <Text variant="muted" className="text-center">
            Ajoute des cartes à tes favoris depuis le feed pour les retrouver
            ici.
          </Text>
        </View>
      ) : (
        <FeedGrid
          data={favorites}
          loading={isLoading}
          refreshing={isRefetching}
          onRefresh={refetch}
        />
      )}
    </SafeAreaView>
  );
}
