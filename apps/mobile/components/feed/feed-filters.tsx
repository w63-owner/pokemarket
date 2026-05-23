import { Pressable, View } from "react-native";
import { SlidersHorizontal, X } from "lucide-react-native";
import type { FeedFilters as FeedFiltersType } from "@pokemarket/shared";

import { Badge, Text } from "@/components/ui";
import { useThemeColor } from "@/lib/theme-colors";
import { CardSearchInput } from "./card-search-input";
import { AdvancedFiltersSheet } from "./advanced-filters-sheet";
import type { CardSuggestion } from "@/lib/api/tcgdex";

type Props = {
  filters: FeedFiltersType;
  searchValue: string;
  onSearchChange: (v: string) => void;
  onSearchSubmit: (v: string) => void;
  onSearchClear: () => void;
  onSearchFocus?: () => void;
  onSearchBlur?: () => void;
  onSelectCard?: (card: CardSuggestion) => void;
  onChange: (patch: Partial<FeedFiltersType>) => void;
  onReset: () => void;
  activeCount: number;
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
};

export function FeedFilters({
  filters,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  onSearchClear,
  onSearchFocus,
  onSearchBlur,
  onChange,
  onReset,
  activeCount,
  sheetOpen,
  onSheetOpenChange,
}: Props) {
  const foreground = useThemeColor("foreground");
  const mutedForeground = useThemeColor("mutedForeground");
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <CardSearchInput
          value={searchValue}
          onChangeText={onSearchChange}
          onSubmit={onSearchSubmit}
          onClear={onSearchClear}
          onFocus={onSearchFocus}
          onBlur={onSearchBlur}
        />

        <Pressable
          onPress={() => onSheetOpenChange(true)}
          accessibilityRole="button"
          accessibilityLabel="Filtres avancés"
          accessibilityHint={
            activeCount > 0
              ? `${activeCount} filtre${activeCount > 1 ? "s" : ""} actif${activeCount > 1 ? "s" : ""}`
              : "Ouvrir les filtres avancés"
          }
          className="relative h-12 w-12 items-center justify-center rounded-xl border border-border bg-background"
        >
          <SlidersHorizontal size={18} color={foreground} />
          {activeCount > 0 ? (
            <View
              className="absolute -right-1 -top-1 h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1"
              accessibilityElementsHidden
            >
              <Text className="text-[10px] font-bold text-primary-foreground">
                {activeCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {activeCount > 0 ? (
        <View className="flex-row items-center gap-2">
          <Badge variant="secondary">
            <Text className="text-xs font-medium">
              {activeCount} filtre{activeCount > 1 ? "s" : ""} actif
              {activeCount > 1 ? "s" : ""}
            </Text>
          </Badge>
          <Pressable
            onPress={onReset}
            hitSlop={6}
            className="flex-row items-center gap-1 px-1 py-0.5"
            accessibilityRole="button"
            accessibilityLabel="Réinitialiser les filtres"
          >
            <X size={12} color={mutedForeground} />
            <Text variant="caption">Réinitialiser</Text>
          </Pressable>
        </View>
      ) : null}

      <AdvancedFiltersSheet
        open={sheetOpen}
        onOpenChange={onSheetOpenChange}
        filters={filters}
        onChange={onChange}
        onReset={onReset}
        activeCount={activeCount}
      />
    </View>
  );
}
