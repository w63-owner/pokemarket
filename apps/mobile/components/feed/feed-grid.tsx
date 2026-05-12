import { ActivityIndicator, RefreshControl, View } from "react-native";
import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list";
import type { FeedItem } from "@pokemarket/shared";
import { ListingCard } from "./listing-card";
import { ListingCardSkeleton } from "./listing-card-skeleton";
import { Text } from "@/components/ui";
import {
  useFavoriteListingIds,
  useToggleFavorite,
} from "@/hooks/use-favorites";

type Props = {
  data: FeedItem[];
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onEndReached?: () => void;
  isFetchingMore?: boolean;
  emptyMessage?: string;
  ListHeaderComponent?: React.ComponentType | React.ReactElement | null;
};

const ITEM_GUTTER = 12;

export function FeedGrid({
  data,
  loading,
  refreshing,
  onRefresh,
  onEndReached,
  isFetchingMore,
  emptyMessage = "Aucun résultat",
  ListHeaderComponent,
}: Props) {
  const { data: favIds = [] } = useFavoriteListingIds();
  const toggleFavorite = useToggleFavorite();

  if (loading && data.length === 0) {
    return (
      <View className="flex-row flex-wrap gap-3 p-4">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: "47.5%" }}>
            <ListingCardSkeleton />
          </View>
        ))}
      </View>
    );
  }

  return (
    <FlashList
      data={data}
      numColumns={2}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: ITEM_GUTTER }}
      ItemSeparatorComponent={() => <View style={{ height: ITEM_GUTTER }} />}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={
        <View className="items-center py-20">
          <Text variant="muted">{emptyMessage}</Text>
        </View>
      }
      ListFooterComponent={
        isFetchingMore ? (
          <View className="py-6">
            <ActivityIndicator size="small" color="#E63946" />
          </View>
        ) : null
      }
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor="#E63946"
          />
        ) : undefined
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      renderItem={({ item }: ListRenderItemInfo<FeedItem>) => (
        <View
          style={{
            flex: 1,
            paddingHorizontal: ITEM_GUTTER / 2,
          }}
        >
          <ListingCard
            item={item}
            isFavorite={favIds.includes(item.id)}
            onToggleFavorite={(id) => toggleFavorite.mutate(id)}
          />
        </View>
      )}
    />
  );
}
