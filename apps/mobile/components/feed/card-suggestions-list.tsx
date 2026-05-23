import { Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon, Search } from "lucide-react-native";
import { queryKeys } from "@pokemarket/shared";

import { Skeleton, Text } from "@/components/ui";
import { useThemeColor } from "@/lib/theme-colors";
import {
  CARD_SEARCH_MIN_LENGTH,
  fetchCardSuggestions,
  parseCardQuery,
  type CardSuggestion,
} from "@/lib/api/tcgdex";

type Props = {
  query: string;
  onSelect: (card: CardSuggestion) => void;
};

export function CardSuggestionsList({ query, onSelect }: Props) {
  const trimmed = query.trim();
  const parsed = parseCardQuery(trimmed);
  const enabled = parsed.name.length >= CARD_SEARCH_MIN_LENGTH;
  const mutedForeground = useThemeColor("mutedForeground");

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: queryKeys.tcgdex.cards(trimmed),
    queryFn: () => fetchCardSuggestions(trimmed),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  if (isFetching && suggestions.length === 0) {
    return (
      <View className="p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <View
            key={i}
            className="mb-2 flex-row items-center gap-3 rounded-lg px-2 py-2"
          >
            <Skeleton className="h-14 w-10 rounded-md" />
            <View className="flex-1">
              <Skeleton className="mb-1.5 h-3 w-1/2" />
              <Skeleton className="h-2.5 w-3/4" />
            </View>
            <Skeleton className="h-5 w-12 rounded-full" />
          </View>
        ))}
      </View>
    );
  }

  if (!enabled) {
    return (
      <View className="flex-1 items-center justify-center px-6 py-12">
        <Search size={24} color={mutedForeground} />
        <Text variant="muted" className="mt-2 text-center">
          Tape un nom de carte, série ou bloc (ex: Dracaufeu 11/25)
        </Text>
      </View>
    );
  }

  if (suggestions.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6 py-12">
        <Search size={22} color={mutedForeground} />
        <Text variant="muted" className="mt-2 text-center">
          Aucune carte pour{" "}
          <Text className="font-medium text-foreground">
            « {parsed.name || trimmed} »
          </Text>
        </Text>
        <Text variant="caption" className="mt-1 text-center">
          Lance la recherche dans les annonces avec le bouton ↵.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingVertical: 4 }}
    >
      {suggestions.map((card) => {
        const number =
          card.local_id && card.set_official_count
            ? `${card.local_id}/${card.set_official_count}`
            : card.local_id;
        const subtitle =
          [card.series_name, card.set_name].filter(Boolean).join(" · ") ||
          "Bloc inconnu";

        return (
          <Pressable
            key={card.card_key}
            accessibilityRole="button"
            onPress={() => onSelect(card)}
            android_ripple={{ color: "rgba(0,0,0,0.06)" }}
            className="flex-row items-center gap-3 px-4 py-2.5 active:bg-muted"
          >
            <View className="h-14 w-10 overflow-hidden rounded-md bg-muted">
              {card.image_url ? (
                <Image
                  source={{ uri: card.image_url }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={120}
                />
              ) : (
                <View className="h-full w-full items-center justify-center">
                  <ImageIcon size={16} color={mutedForeground} />
                </View>
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-medium" numberOfLines={1}>
                {card.name}
              </Text>
              <Text variant="caption" numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
            {number ? (
              <View className="rounded-full bg-muted px-2 py-0.5">
                <Text className="text-[11px] text-muted-foreground">
                  {number}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
