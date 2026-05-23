import { useCallback } from "react";
import { Alert, FlatList, Pressable, View } from "react-native";
import { router } from "expo-router";
import { ExternalLink, Search, Trash2 } from "lucide-react-native";
import { MotiView } from "moti";
import {
  type FeedFilters,
  filtersToLabel,
  type SavedSearch,
} from "@pokemarket/shared";

import { Badge, Skeleton, Text } from "@/components/ui";
import { EmptyState } from "@/components/shared";
import {
  useDeleteSavedSearch,
  useMarkSavedSearchSeen,
  useSavedSearchNewCounts,
  useSavedSearches,
} from "@/hooks/use-saved-searches";
import { fadeInUp, staggerDelay, useReducedMotionSafe } from "@/lib/motion";
import { usePendingFeedFiltersStore } from "@/lib/stores/pending-feed-filters";
import { useThemeColor } from "@/lib/theme-colors";

function formatRelative(date: Date): string {
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days}j`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function Row({
  search,
  newCount,
  index,
  onRun,
  onDelete,
}: {
  search: SavedSearch;
  newCount: number;
  index: number;
  onRun: (id: string, params: FeedFilters) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const mutedForeground = useThemeColor("mutedForeground");
  const destructive = useThemeColor("destructive");
  const primary = useThemeColor("primary");
  const reduceMotion = useReducedMotionSafe();

  const params = (search.search_params ?? {}) as FeedFilters;
  const label = filtersToLabel(params);
  const relative = search.created_at
    ? formatRelative(new Date(search.created_at))
    : "—";

  return (
    <MotiView
      from={reduceMotion ? fadeInUp.animate : fadeInUp.from}
      animate={fadeInUp.animate}
      transition={{
        ...(fadeInUp.transition as object),
        delay: staggerDelay(index, 50, 8),
      }}
    >
      <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Lancer la recherche ${search.name}`}
          onPress={() => onRun(search.id, params)}
          className="min-w-0 flex-1 gap-1"
        >
          <View className="flex-row items-center gap-2">
            <Text
              numberOfLines={1}
              className="shrink truncate text-sm font-medium"
            >
              {search.name}
            </Text>
            {newCount > 0 ? (
              <Badge variant="default">
                <Text className="text-[10px] font-bold text-primary-foreground">
                  {newCount} nouvelle{newCount > 1 ? "s" : ""}
                </Text>
              </Badge>
            ) : null}
          </View>
          <Text variant="caption" numberOfLines={1}>
            {label}
          </Text>
          <Text variant="caption" className="text-muted-foreground/70">
            {relative}
          </Text>
        </Pressable>

        <View className="flex-row items-center gap-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lancer la recherche"
            hitSlop={8}
            onPress={() => onRun(search.id, params)}
            className="h-9 w-9 items-center justify-center rounded-lg"
          >
            <ExternalLink size={18} color={primary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Supprimer la recherche"
            hitSlop={8}
            onPress={() => onDelete(search.id, search.name)}
            className="h-9 w-9 items-center justify-center rounded-lg"
          >
            <Trash2
              size={18}
              color={newCount > 0 ? mutedForeground : destructive}
            />
          </Pressable>
        </View>
      </View>
    </MotiView>
  );
}

export function SavedSearchesList() {
  const { data: searches, isLoading, isError, error } = useSavedSearches();
  const { mutate: markSeen } = useMarkSavedSearchSeen();
  const { mutate: deleteSearch } = useDeleteSavedSearch();
  const { countsMap } = useSavedSearchNewCounts();
  const setPending = usePendingFeedFiltersStore((s) => s.setPending);
  const mutedForeground = useThemeColor("mutedForeground");
  const destructive = useThemeColor("destructive");

  const handleRun = useCallback(
    (id: string, params: FeedFilters) => {
      markSeen(id);
      setPending(params);
      // Bring the user back to the home feed — the screen consumes the
      // pending filters on focus and updates the feed accordingly.
      router.navigate("/(tabs)");
    },
    [markSeen, setPending],
  );

  const handleDelete = useCallback(
    (id: string, name: string) => {
      Alert.alert(
        "Supprimer la recherche ?",
        `« ${name} » sera supprimée définitivement.`,
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Supprimer",
            style: "destructive",
            onPress: () => deleteSearch(id),
          },
        ],
      );
    },
    [deleteSearch],
  );

  if (isLoading) {
    return (
      <View className="gap-3 px-4 pt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <View
            key={i}
            className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4"
          >
            <View className="flex-1 gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-20" />
            </View>
            <Skeleton className="h-8 w-8 rounded-lg" />
          </View>
        ))}
      </View>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<Search size={28} color={destructive} />}
        title="Impossible de charger les recherches"
        description={error?.message ?? "Une erreur est survenue."}
      />
    );
  }

  if (!searches || searches.length === 0) {
    return (
      <EmptyState
        icon={<Search size={28} color={mutedForeground} />}
        title="Aucune recherche sauvegardée"
        description="Ouvre les filtres avancés du feed puis appuie sur « Sauvegarder cette recherche » pour la retrouver ici."
      />
    );
  }

  return (
    <FlatList
      data={searches}
      keyExtractor={(s) => s.id}
      contentContainerStyle={{ gap: 12, padding: 16 }}
      renderItem={({ item, index }) => (
        <Row
          search={item}
          newCount={countsMap.get(item.id) ?? 0}
          index={index}
          onRun={handleRun}
          onDelete={handleDelete}
        />
      )}
    />
  );
}
