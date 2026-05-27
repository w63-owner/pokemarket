import { useCallback, useMemo } from "react";
import { RefreshControl, useWindowDimensions, View } from "react-native";
import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list";
import { MotiView } from "moti";
import { AlertCircle, PackageOpen } from "lucide-react-native";
import type { FeedItem } from "@pokemarket/shared";

import { ListingCard } from "./listing-card";
import { ListingCardSkeleton } from "./listing-card-skeleton";
import { ErrorState } from "@/components/shared";
import { Button, Text } from "@/components/ui";
import {
  useFavoriteListingIds,
  useToggleFavorite,
} from "@/hooks/use-favorites";
import { fadeInUp, useReducedMotionSafe } from "@/lib/motion";
import { useThemeColor } from "@/lib/theme-colors";

type Props = {
  data: FeedItem[];
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onEndReached?: () => void;
  isFetchingMore?: boolean;
  /** Title shown in the rich empty state when `data` is empty. */
  emptyTitle?: string;
  /** Secondary message under the empty title. */
  emptyMessage?: string;
  /** Optional CTA shown in the empty state (e.g. "Adjust filters"). */
  emptyAction?: { label: string; onPress: () => void };
  /**
   * When defined, the grid renders an error state in place of the list.
   * Mirrors the web `feed-grid.tsx` destructive border + retry button.
   */
  error?: { message: string; onRetry?: () => void };
  ListHeaderComponent?: React.ComponentType | React.ReactElement | null;
};

const ITEM_GUTTER = 12;
// Breakpoint mirroring `md:grid-cols-3` on the web feed — phones in
// landscape (~750px) and small tablets jump to 3 columns; phablets keep
// the 2-column dense grid for legibility.
const TABLET_BREAKPOINT = 768;

export function FeedGrid({
  data,
  loading,
  refreshing,
  onRefresh,
  onEndReached,
  isFetchingMore,
  emptyTitle = "Aucun résultat",
  emptyMessage,
  emptyAction,
  error,
  ListHeaderComponent,
}: Props) {
  const { data: favIds = [] } = useFavoriteListingIds();
  const toggleFavorite = useToggleFavorite();
  const primary = useThemeColor("primary");
  const mutedForeground = useThemeColor("mutedForeground");
  const destructive = useThemeColor("destructive");
  const reduceMotion = useReducedMotionSafe();

  // Stable Set so `ListingCard` memo stays effective even when the favIds
  // array reference changes but the contents are the same.
  const favIdsSet = useMemo(() => new Set(favIds), [favIds]);

  // Stable callback — avoids re-creating `renderItem` on every render.
  const handleToggleFavorite = useCallback(
    (id: string) => toggleFavorite.mutate(id),
    [toggleFavorite],
  );

  // Pick column count based on viewport width — kept reactive so a
  // device rotation or iPad split-view resize re-flows live.
  const { width } = useWindowDimensions();
  const columns = width >= TABLET_BREAKPOINT ? 3 : 2;
  const skeletonCount = columns * 3;

  if (loading && data.length === 0) {
    return (
      <View className="flex-row flex-wrap gap-3 p-4">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <View key={i} style={{ width: `${100 / columns - 2.5}%` }}>
            <ListingCardSkeleton />
          </View>
        ))}
      </View>
    );
  }

  // Error state — shown only when the query truly failed and there is no
  // cached data to fall back to. Border-destructive + retry CTA mirrors
  // the web component.
  if (error && data.length === 0) {
    return (
      <View className="items-center justify-center px-6 py-20">
        <ErrorState
          variant="card"
          icon={<AlertCircle size={26} color={destructive} />}
          title="Impossible de charger le feed"
          description={error.message}
          action={
            error.onRetry
              ? {
                  label: "Réessayer",
                  onPress: error.onRetry,
                }
              : undefined
          }
        />
      </View>
    );
  }

  const renderEmpty = () => (
    <View className="items-center justify-center px-6 py-16">
      <MotiView
        from={reduceMotion ? fadeInUp.animate : fadeInUp.from}
        animate={fadeInUp.animate}
        transition={fadeInUp.transition}
        className="items-center gap-3"
      >
        <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
          <PackageOpen size={28} color={mutedForeground} />
        </View>
        <View className="max-w-xs items-center gap-1">
          <Text variant="h4" className="text-center">
            {emptyTitle}
          </Text>
          {emptyMessage ? (
            <Text variant="muted" className="text-center">
              {emptyMessage}
            </Text>
          ) : null}
        </View>
        {emptyAction ? (
          <Button
            variant="outline"
            onPress={emptyAction.onPress}
            className="mt-2"
          >
            {emptyAction.label}
          </Button>
        ) : null}
      </MotiView>
    </View>
  );

  // 2 skeleton "ghost" cards during page fetch. Cohérent avec le footer
  // web qui montre un row de cards squelette pour signaler que le scroll
  // infini est actif (vs. un ActivityIndicator générique).
  const renderFooter = () => {
    if (!isFetchingMore) return null;
    return (
      <View className="flex-row flex-wrap gap-3 pt-3">
        {Array.from({ length: columns }).map((_, i) => (
          <View key={i} style={{ width: `${100 / columns - 2.5}%` }}>
            <ListingCardSkeleton />
          </View>
        ))}
      </View>
    );
  };

  // Stable renderItem — depends only on favIdsSet and handleToggleFavorite
  // so FlashList's internal item recycler is not invalidated on every
  // parent render. The entrance MotiView has been removed: the per-card
  // stagger animation was the primary source of JS-thread jank on scroll.
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<FeedItem>) => (
      <View style={{ flex: 1, paddingHorizontal: ITEM_GUTTER / 2 }}>
        <ListingCard
          item={item}
          isFavorite={favIdsSet.has(item.id)}
          onToggleFavorite={handleToggleFavorite}
        />
      </View>
    ),
    [favIdsSet, handleToggleFavorite],
  );

  return (
    <FlashList
      data={data}
      numColumns={columns}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: ITEM_GUTTER }}
      ItemSeparatorComponent={() => <View style={{ height: ITEM_GUTTER }} />}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={renderEmpty}
      ListFooterComponent={renderFooter}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={primary}
          />
        ) : undefined
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      renderItem={renderItem}
    />
  );
}
