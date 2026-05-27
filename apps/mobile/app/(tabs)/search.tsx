import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInfiniteFeed } from "@/hooks/use-infinite-feed";
import { useDebounce } from "@/hooks/use-debounce";
import { FeedGrid } from "@/components/feed/feed-grid";
import { CardSearchInput } from "@/components/feed/card-search-input";
import { Text } from "@/components/ui";

export default function SearchScreen() {
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);

  const query = useInfiniteFeed({ q: debounced });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="border-b border-border bg-background px-4 pb-3 pt-2">
        <Text variant="h2" className="mb-3">
          Recherche
        </Text>
        <CardSearchInput value={search} onChangeText={setSearch} />
      </View>
      {debounced.length === 0 ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text variant="muted">Tape un nom de carte ou un set.</Text>
        </View>
      ) : (
        <FeedGrid
          data={items}
          loading={query.isLoading}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) {
              query.fetchNextPage();
            }
          }}
          isFetchingMore={query.isFetchingNextPage}
          emptyMessage={`Aucun résultat pour "${debounced}"`}
        />
      )}
    </SafeAreaView>
  );
}
