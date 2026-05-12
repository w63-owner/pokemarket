import { useCallback, useEffect, useState } from "react";
import { Keyboard, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useInfiniteFeed } from "@/hooks/use-infinite-feed";
import { useFeedFilters, countActiveFilters } from "@/hooks/use-feed-filters";
import { useDebounce } from "@/hooks/use-debounce";
import { FeedGrid } from "@/components/feed/feed-grid";
import { FeedFilters } from "@/components/feed/feed-filters";
import { CardSuggestionsList } from "@/components/feed/card-suggestions-list";
import { Text } from "@/components/ui";
import { CARD_SEARCH_MIN_LENGTH, parseCardQuery } from "@/lib/api/tcgdex";

export default function HomeScreen() {
  const { filters, update, reset } = useFeedFilters();
  const [searchValue, setSearchValue] = useState(filters.q ?? "");
  const [searchFocused, setSearchFocused] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const debouncedSearch = useDebounce(searchValue, 250);

  const activeCount = countActiveFilters(filters);
  const parsed = parseCardQuery(debouncedSearch);
  const showSuggestions =
    searchFocused && parsed.name.length >= CARD_SEARCH_MIN_LENGTH;

  const query = useInfiniteFeed(filters);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    const next = debouncedSearch.trim();
    if (next === (filters.q ?? "")) return;
    update({ q: next || undefined });
  }, [debouncedSearch, filters.q, update]);

  const handleSelectCard = useCallback(
    (card: {
      name: string;
      set_name: string | null;
      series_name: string | null;
      local_id: string | null;
      set_official_count: number | null;
    }) => {
      const cardNumber =
        card.local_id && card.set_official_count
          ? `${card.local_id}/${card.set_official_count}`
          : (card.local_id ?? undefined);

      setSearchValue(card.name);
      update({
        q: card.name,
        set: card.set_name ?? undefined,
        series: card.series_name ?? undefined,
        card_number: cardNumber,
      });
      setSearchFocused(false);
      Keyboard.dismiss();
    },
    [update],
  );

  const handleSubmitSearch = useCallback(
    (v: string) => {
      update({ q: v.trim() || undefined });
      setSearchFocused(false);
      Keyboard.dismiss();
    },
    [update],
  );

  const handleClearSearch = useCallback(() => {
    setSearchValue("");
    update({ q: undefined });
  }, [update]);

  const handleResetFilters = useCallback(() => {
    setSearchValue("");
    reset();
    setSheetOpen(false);
  }, [reset]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="border-b border-border bg-background px-4 pb-3 pt-2">
        <Text variant="h2" className="mb-3">
          PokeMarket
        </Text>
        <FeedFilters
          filters={filters}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          onSearchSubmit={handleSubmitSearch}
          onSearchClear={handleClearSearch}
          onSearchFocus={() => setSearchFocused(true)}
          onSearchBlur={() => setSearchFocused(false)}
          onChange={update}
          onReset={handleResetFilters}
          activeCount={activeCount}
          sheetOpen={sheetOpen}
          onSheetOpenChange={setSheetOpen}
        />
      </View>

      {showSuggestions ? (
        <CardSuggestionsList
          query={debouncedSearch}
          onSelect={handleSelectCard}
        />
      ) : (
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
            activeCount > 0
              ? "Aucune annonce ne correspond aux filtres"
              : "Le feed est vide"
          }
        />
      )}
    </SafeAreaView>
  );
}
