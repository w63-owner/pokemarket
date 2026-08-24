import { Image } from "expo-image";
import { router, Stack, type Href } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  ImageIcon,
  ShieldCheck,
  Trophy,
} from "lucide-react-native";
import {
  queryKeys,
  type CardMarketTopEntry,
  type CardMarketTopResponse,
} from "@deckdealr/shared";

import { api } from "@/lib/api/client";
import { MobileHeader } from "@/components/layout/mobile-header";
import { CardQuoteSearch } from "@/components/price-checking/card-quote-search";
import { EmptyState, ErrorState } from "@/components/shared";
import { Badge, Skeleton, Text } from "@/components/ui";
import { useThemeColor } from "@/lib/theme-colors";

async function fetchCardMarketTop(): Promise<CardMarketTopResponse> {
  return api.get<CardMarketTopResponse>("/api/cards/top", {
    authenticated: false,
  });
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(price);
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function TopCard({ entry }: { entry: CardMarketTopEntry }) {
  const mutedForeground = useThemeColor("mutedForeground");
  const number =
    entry.local_id && entry.set_official_count
      ? `${entry.local_id}/${entry.set_official_count}`
      : entry.local_id;

  return (
    <Pressable
      onPress={() =>
        router.push(
          `/price-checking/${encodeURIComponent(entry.card_key)}` as Href,
        )
      }
      accessibilityRole="button"
      accessibilityLabel={`Rang ${entry.rank}, ${entry.name}, ${formatPrice(entry.price, entry.currency)}`}
      className="min-h-28 flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3 active:border-primary/40 active:bg-muted/30"
    >
      <View
        className={
          entry.rank <= 3
            ? "h-9 w-9 items-center justify-center rounded-full bg-primary"
            : "h-9 w-9 items-center justify-center"
        }
      >
        <Text
          className={
            entry.rank <= 3
              ? "font-bold text-primary-foreground"
              : "font-semibold text-muted-foreground"
          }
        >
          {entry.rank}
        </Text>
      </View>

      <View className="h-20 w-14 overflow-hidden rounded-lg border border-border bg-muted">
        {entry.image_url ? (
          <Image
            source={{ uri: entry.image_url }}
            style={{ width: "100%", height: "100%" }}
            contentFit="contain"
            transition={150}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <ImageIcon size={20} color={mutedForeground} />
          </View>
        )}
      </View>

      <View className="min-w-0 flex-1">
        <Text className="font-semibold" numberOfLines={1}>
          {entry.name}
        </Text>
        <Text variant="caption" numberOfLines={1} className="mt-0.5">
          {[entry.set_name, number].filter(Boolean).join(" · ")}
        </Text>
        <View className="mt-2 flex-row flex-wrap items-center gap-2">
          <Text className="text-lg font-bold text-primary">
            {formatPrice(entry.price, entry.currency)}
          </Text>
          <Badge variant="secondary">
            {entry.variant === "holo" ? "Holo" : "Normale"}
          </Badge>
        </View>
      </View>
    </Pressable>
  );
}

function TopCards() {
  const primary = useThemeColor("primary");
  const mutedForeground = useThemeColor("mutedForeground");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.cardMarket.top(),
    queryFn: fetchCardMarketTop,
    staleTime: 15 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <View className="gap-3">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-8 w-72" />
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-2xl" />
        ))}
      </View>
    );
  }

  if (isError) {
    return (
      <ErrorState
        variant="card"
        title="Classement indisponible"
        description="Impossible de charger les prix Cardmarket pour le moment."
        action={{ label: "Réessayer", onPress: () => void refetch() }}
      />
    );
  }

  if (!data?.entries.length) {
    return (
      <EmptyState
        icon={<BarChart3 size={28} color={mutedForeground} />}
        title="Le classement se prépare"
        description="Les premiers prix Cardmarket réels sont en cours de collecte. Aucune donnée fictive ne sera affichée."
      />
    );
  }

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Trophy size={17} color={primary} />
        <Text className="text-sm font-semibold text-primary">
          Marché français
        </Text>
      </View>
      <Text variant="h3">Top 10 des cartes les plus chères</Text>
      <Text variant="muted">
        Cote Cardmarket actuelle via TCGdex, cartes non gradées.
      </Text>
      {data.snapshot_date ? (
        <View className="flex-row items-center gap-1.5">
          <CalendarClock size={14} color={mutedForeground} />
          <Text variant="caption">
            Relevé du {formatDate(data.snapshot_date)}
          </Text>
        </View>
      ) : null}
      <View className="mt-2 gap-3">
        {data.entries.map((entry) => (
          <TopCard key={`${entry.card_key}-${entry.variant}`} entry={entry} />
        ))}
      </View>
    </View>
  );
}

export default function PriceCheckingScreen() {
  const brand = useThemeColor("brand");
  const mutedForeground = useThemeColor("mutedForeground");

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <MobileHeader title="Cote des cartes" fallbackHref="/(tabs)/profile" />
      <SafeAreaView className="flex-1" edges={["bottom"]}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        >
          <View className="items-center px-2 pb-7 pt-3">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <BarChart3 size={27} color={brand} />
            </View>
            <Text variant="h2" className="mt-4 text-center">
              Combien vaut ta carte ?
            </Text>
            <Text variant="muted" className="mt-2 text-center">
              Retrouve sa cote Cardmarket actuelle, sa variante et son
              historique réel.
            </Text>
          </View>

          <CardQuoteSearch />

          <View className="my-5 flex-row items-center justify-center gap-2">
            <ShieldCheck size={14} color={mutedForeground} />
            <Text variant="caption">
              Données distinctes des annonces et ventes DeckDealr
            </Text>
          </View>

          <View className="mt-3">
            <TopCards />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
