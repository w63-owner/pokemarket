import { useState } from "react";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { Keyboard, Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon, Search, X } from "lucide-react-native";
import {
  queryKeys,
  type CardSearchResponse,
  type CardSearchResult,
} from "@deckdealr/shared";

import { useDebounce } from "@/hooks/use-debounce";
import { api } from "@/lib/api/client";
import { useThemeColor } from "@/lib/theme-colors";
import { Input, Skeleton, Text } from "@/components/ui";

async function searchCards(query: string): Promise<CardSearchResponse> {
  return api.get<CardSearchResponse>("/api/cards/search", {
    authenticated: false,
    searchParams: { q: query },
  });
}

function CardResult({
  card,
  onPress,
}: {
  card: CardSearchResult;
  onPress: () => void;
}) {
  const mutedForeground = useThemeColor("mutedForeground");
  const number =
    card.local_id && card.set_official_count
      ? `${card.local_id}/${card.set_official_count}`
      : card.local_id;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Consulter la cote de ${card.name}`}
      className="min-h-20 flex-row items-center gap-3 border-b border-border py-2 active:bg-muted/50"
    >
      <View className="h-16 w-12 overflow-hidden rounded-lg border border-border bg-muted">
        {card.image_url ? (
          <Image
            source={{ uri: card.image_url }}
            style={{ width: "100%", height: "100%" }}
            contentFit="contain"
            transition={150}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <ImageIcon size={18} color={mutedForeground} />
          </View>
        )}
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-semibold" numberOfLines={1}>
          {card.name}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {[card.set_name, number].filter(Boolean).join(" · ")}
        </Text>
        {card.rarity ? (
          <Text variant="caption" numberOfLines={1}>
            {card.rarity}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function CardQuoteSearch() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const debouncedQuery = useDebounce(query.trim(), 300);
  const foreground = useThemeColor("foreground");
  const mutedForeground = useThemeColor("mutedForeground");

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.cardMarket.search(debouncedQuery),
    queryFn: () => searchCards(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const showPanel = focused && query.trim().length >= 2;
  const selectCard = (card: CardSearchResult) => {
    Keyboard.dismiss();
    setFocused(false);
    router.push(`/price-checking/${encodeURIComponent(card.card_key)}` as Href);
  };

  return (
    <View className="gap-2">
      <View className="relative">
        <View
          pointerEvents="none"
          className="absolute left-4 top-0 z-10 h-12 justify-center"
        >
          <Search size={19} color={mutedForeground} />
        </View>
        <Input
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          placeholder="Nom, extension ou numéro…"
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          className="pl-11 pr-11"
          accessibilityLabel="Rechercher une carte Pokémon"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery("")}
            accessibilityRole="button"
            accessibilityLabel="Effacer la recherche"
            hitSlop={8}
            className="absolute right-1 top-0 z-10 h-12 w-10 items-center justify-center"
          >
            <X size={18} color={foreground} />
          </Pressable>
        ) : null}
      </View>

      {showPanel ? (
        <View className="overflow-hidden rounded-2xl border border-border bg-card px-3">
          {isLoading || debouncedQuery !== query.trim() ? (
            <View className="gap-2 py-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-20 w-full rounded-xl" />
              ))}
            </View>
          ) : isError ? (
            <View className="items-center gap-1 py-6">
              <Text className="font-semibold">Recherche indisponible</Text>
              <Text variant="muted" className="text-center">
                Vérifie ta connexion puis réessaie.
              </Text>
            </View>
          ) : data?.results.length ? (
            data.results
              .slice(0, 10)
              .map((card) => (
                <CardResult
                  key={card.card_key}
                  card={card}
                  onPress={() => selectCard(card)}
                />
              ))
          ) : (
            <View className="items-center gap-1 py-6">
              <Text className="font-semibold">Aucune carte trouvée</Text>
              <Text variant="muted" className="text-center">
                Essaie un autre nom, une extension ou un numéro.
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}
