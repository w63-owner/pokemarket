import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInfiniteFeed } from "@/hooks/use-infinite-feed";
import { useFeedFilters } from "@/hooks/use-feed-filters";
import { useDebounce } from "@/hooks/use-debounce";
import { FeedGrid } from "@/components/feed/feed-grid";
import { CardSearchInput } from "@/components/feed/card-search-input";
import { Text } from "@/components/ui";

export default function HomeScreen() {
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const { filters } = useFeedFilters({ q: debounced });

  const query = useInfiniteFeed({ ...filters, q: debounced });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="border-b border-border bg-background px-4 pb-3 pt-2">
        <Text variant="h2" className="mb-3">
          PokeMarket
        </Text>
        <CardSearchInput value={search} onChange={setSearch} />
      </View>
      <FeedGrid
        data={items}
        loading={query.isLoading}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={() => query.refetch()}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            query.fetchNextPage();
          }
        }}
        isFetchingMore={query.isFetchingNextPage}
        emptyMessage={
          search
            ? `Aucune carte ne correspond à "${search}"`
            : "Le feed est vide"
        }
      />
    </SafeAreaView>
  );
}
