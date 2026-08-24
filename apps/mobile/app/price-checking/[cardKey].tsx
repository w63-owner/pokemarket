import { useState } from "react";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  ImageIcon,
  Search,
  ShieldCheck,
  Tag,
} from "lucide-react-native";
import {
  queryKeys,
  type CardMarketDetailResponse,
  type CardmarketVariant,
  type CardmarketVariantQuote,
} from "@deckdealr/shared";

import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { useThemeColor } from "@/lib/theme-colors";
import { MobileHeader } from "@/components/layout/mobile-header";
import { PriceHistoryChart } from "@/components/listing/price-history-chart";
import { CardSalesSummary } from "@/components/price-checking/card-sales-summary";
import { ErrorState } from "@/components/shared";
import { Badge, Button, Skeleton, Text } from "@/components/ui";

async function fetchCardDetail(
  cardKey: string,
): Promise<CardMarketDetailResponse> {
  return api.get<CardMarketDetailResponse>(
    `/api/cards/${encodeURIComponent(cardKey)}`,
    { authenticated: false },
  );
}

function formatPrice(value: number | null, currency: string): string {
  if (value == null) return "Indisponible";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(value);
}

function formatFreshness(updatedAt: string | null): string {
  if (!updatedAt) return "Date de mise à jour indisponible";
  return `Mise à jour le ${new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(updatedAt))}`;
}

function QuoteMetric({
  label,
  value,
  currency,
}: {
  label: string;
  value: number | null;
  currency: string;
}) {
  return (
    <View className="min-w-[30%] flex-1 rounded-xl bg-muted/50 p-3">
      <Text variant="caption">{label}</Text>
      <Text className="mt-1 text-sm font-semibold">
        {formatPrice(value, currency)}
      </Text>
    </View>
  );
}

function PriceBlock({
  quote,
  currency,
}: {
  quote: CardmarketVariantQuote;
  currency: string;
}) {
  const mutedForeground = useThemeColor("mutedForeground");

  if (quote.current == null) {
    return (
      <View className="items-center rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-8">
        <BarChart3 size={26} color={mutedForeground} />
        <Text className="mt-3 font-semibold">Prix non disponible</Text>
        <Text variant="muted" className="mt-1 text-center">
          Cardmarket ne fournit pas encore de cote exploitable pour cette
          variante. Aucun prix fictif n&apos;est affiché.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-2">
      <View className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Cote tendance actuelle
        </Text>
        <Text className="mt-2 text-4xl font-bold tracking-tight">
          {formatPrice(quote.current, currency)}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <QuoteMetric label="Tendance" value={quote.trend} currency={currency} />
        <QuoteMetric
          label="Moyenne"
          value={quote.average}
          currency={currency}
        />
        <QuoteMetric
          label="Moy. 30 j"
          value={quote.average30}
          currency={currency}
        />
      </View>
    </View>
  );
}

function DetailSkeleton() {
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <MobileHeader title="Cote de la carte" fallbackHref="/price-checking" />
      <View className="gap-4 p-4">
        <Skeleton
          className="w-full rounded-2xl"
          style={{ aspectRatio: 5 / 7 }}
        />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </View>
    </View>
  );
}

export default function CardQuoteDetailScreen() {
  const { cardKey: rawCardKey } = useLocalSearchParams<{
    cardKey?: string | string[];
  }>();
  const cardKey = Array.isArray(rawCardKey)
    ? (rawCardKey[0] ?? "")
    : (rawCardKey ?? "");
  const [chosenVariant, setChosenVariant] = useState<CardmarketVariant | null>(
    null,
  );
  const foreground = useThemeColor("foreground");
  const mutedForeground = useThemeColor("mutedForeground");
  const primaryForeground = useThemeColor("primaryForeground");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.cardMarket.detail(cardKey),
    queryFn: () => fetchCardDetail(cardKey),
    enabled: cardKey.length > 0,
    staleTime: 15 * 60 * 1000,
  });

  if (isLoading) return <DetailSkeleton />;

  if (!cardKey || isError || !data) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ headerShown: false }} />
        <MobileHeader
          title="Cote indisponible"
          fallbackHref="/price-checking"
        />
        <View className="flex-1 items-center justify-center px-4">
          <ErrorState
            variant="card"
            title="Impossible de charger cette cote"
            description={
              !cardKey
                ? "Le lien de cette carte est invalide."
                : "Vérifie ta connexion puis réessaie."
            }
            action={
              cardKey
                ? { label: "Réessayer", onPress: () => void refetch() }
                : undefined
            }
          />
        </View>
      </View>
    );
  }

  const { card } = data;
  const selectedVariant = card.available_variants.includes(
    chosenVariant ?? "normal",
  )
    ? (chosenVariant ?? "normal")
    : card.available_variants[0];
  const quote = card.pricing?.[selectedVariant] ?? {
    variant: selectedVariant,
    current: null,
    trend: null,
    average: null,
    average30: null,
  };
  const currency = card.pricing?.currency ?? "EUR";
  const number =
    card.local_id && card.set_official_count
      ? `${card.local_id}/${card.set_official_count}`
      : card.local_id;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <MobileHeader title={card.name} fallbackHref="/price-checking" />
      <SafeAreaView className="flex-1" edges={["bottom"]}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <View className="mx-auto w-full max-w-sm">
            <View
              className="w-full overflow-hidden rounded-2xl border border-border bg-muted"
              style={{ aspectRatio: 5 / 7 }}
            >
              {card.image_url ? (
                <Image
                  source={{ uri: card.image_url }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="contain"
                  transition={200}
                  priority="high"
                />
              ) : (
                <View className="flex-1 items-center justify-center gap-2">
                  <ImageIcon size={30} color={mutedForeground} />
                  <Text variant="muted">Visuel indisponible</Text>
                </View>
              )}
            </View>
          </View>

          <View className="mt-5 flex-row flex-wrap gap-2">
            <Badge variant="secondary">
              {card.set_name ?? "Extension inconnue"}
            </Badge>
            {number ? <Badge variant="outline">N° {number}</Badge> : null}
            {card.rarity ? (
              <Badge variant="outline">{card.rarity}</Badge>
            ) : null}
          </View>
          <Text variant="h2" className="mt-3">
            {card.name}
          </Text>
          <Text variant="muted" className="mt-1">
            {[card.series_name, card.illustrator].filter(Boolean).join(" · ")}
          </Text>

          <View className="mt-7 gap-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="font-semibold">Cardmarket via TCGdex</Text>
                <View className="mt-1 flex-row items-center gap-1.5">
                  <CalendarClock size={14} color={mutedForeground} />
                  <Text variant="caption">
                    {formatFreshness(card.pricing?.updatedAt ?? null)}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-1.5">
                <ShieldCheck size={14} color={mutedForeground} />
                <Text variant="caption">Externe</Text>
              </View>
            </View>

            {card.available_variants.length > 1 ? (
              <View
                className="flex-row self-start rounded-xl bg-muted p-1"
                accessibilityRole="tablist"
              >
                {card.available_variants.map((variant) => {
                  const active = selectedVariant === variant;
                  return (
                    <Pressable
                      key={variant}
                      onPress={() => setChosenVariant(variant)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      className={cn(
                        "rounded-lg px-4 py-2",
                        active && "bg-background",
                      )}
                    >
                      <Text
                        className={cn(
                          "text-sm font-medium text-muted-foreground",
                          active && "text-foreground",
                        )}
                      >
                        {variant === "holo" ? "Holographique" : "Normale"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <PriceBlock quote={quote} currency={currency} />
          </View>

          <View className="mt-5">
            <PriceHistoryChart
              cardKey={card.card_key}
              condition={null}
              language="fr"
              isGraded={false}
              variant={selectedVariant}
            />
          </View>

          <CardSalesSummary cardKey={card.card_key} variant={selectedVariant} />

          <View className="mt-5 gap-3">
            <Button
              variant="outline"
              size="lg"
              onPress={() =>
                router.push({
                  pathname: "/(tabs)",
                  params: { q: [card.name, number].filter(Boolean).join(" ") },
                })
              }
              leftIcon={<Search size={18} color={foreground} />}
            >
              Voir les annonces
            </Button>
            <Button
              size="lg"
              onPress={() => router.push("/(tabs)/sell")}
              leftIcon={<Tag size={18} color={primaryForeground} />}
            >
              Vendre cette carte
            </Button>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
