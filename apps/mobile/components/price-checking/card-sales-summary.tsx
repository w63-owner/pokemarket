import { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Info, RefreshCw, ShoppingBag, TrendingUp } from "lucide-react-native";
import {
  CARD_CONDITIONS,
  CONDITION_LABELS,
  GRADING_COMPANIES,
  queryKeys,
  type CardCondition,
  type CardmarketVariant,
  type DeckDealrSalesResponse,
} from "@deckdealr/shared";

import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { useThemeColor } from "@/lib/theme-colors";
import {
  Badge,
  Button,
  Card,
  Select,
  Skeleton,
  Text,
  type SelectOption,
} from "@/components/ui";

const CONDITION_OPTIONS: SelectOption[] = CARD_CONDITIONS.map((condition) => ({
  value: condition,
  label: CONDITION_LABELS[condition as CardCondition],
}));
const GRADING_OPTIONS: SelectOption[] = GRADING_COMPANIES.map((company) => ({
  value: company,
  label: company,
}));
const GRADE_OPTIONS: SelectOption[] = Array.from(
  { length: 19 },
  (_, index) => 10 - index * 0.5,
).map((grade) => ({ value: String(grade), label: String(grade) }));

function formatPrice(value: number | null, currency = "EUR") {
  if (value == null) return "Indisponible";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(value);
}

async function fetchSales(
  cardKey: string,
  variant: CardmarketVariant,
  condition: string | null,
  isGraded: boolean,
  gradingCompany: string | null,
  gradeNote: number | null,
): Promise<DeckDealrSalesResponse> {
  return api.get<DeckDealrSalesResponse>(
    `/api/cards/${encodeURIComponent(cardKey)}/sales`,
    {
      authenticated: false,
      searchParams: {
        variant,
        isGraded: String(isGraded),
        ...(condition ? { condition } : {}),
        ...(gradingCompany ? { gradingCompany } : {}),
        ...(gradeNote != null ? { gradeNote: String(gradeNote) } : {}),
      },
    },
  );
}

export function CardSalesSummary({
  cardKey,
  variant,
}: {
  cardKey: string;
  variant: CardmarketVariant;
}) {
  const [condition, setCondition] = useState<string>("NEAR_MINT");
  const [isGraded, setIsGraded] = useState(false);
  const [gradingCompany, setGradingCompany] = useState<string>(
    GRADING_COMPANIES[0] ?? "PCA",
  );
  const [gradeNote, setGradeNote] = useState(10);
  const foreground = useThemeColor("foreground");
  const mutedForeground = useThemeColor("mutedForeground");

  const filters = {
    condition: isGraded ? null : condition,
    gradeNote: isGraded ? gradeNote : null,
    gradingCompany: isGraded ? gradingCompany : null,
    isGraded,
    variant,
  };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.deckDealrSales.summary(cardKey, filters),
    queryFn: () =>
      fetchSales(
        cardKey,
        variant,
        filters.condition,
        isGraded,
        filters.gradingCompany,
        filters.gradeNote,
      ),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <Skeleton className="mt-4 h-64 w-full rounded-2xl" />;
  }

  if (isError || !data) {
    return (
      <Card className="mt-4 gap-3">
        <View className="flex-row items-center gap-2">
          <ShoppingBag size={18} color={foreground} />
          <Text className="font-semibold">Ventes sur DeckDealr</Text>
        </View>
        <Text variant="muted">
          Les ventes réelles sont temporairement indisponibles.
        </Text>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onPress={() => void refetch()}
          leftIcon={<RefreshCw size={16} color={foreground} />}
        >
          Réessayer
        </Button>
      </Card>
    );
  }

  return (
    <Card className="mt-4 gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <ShoppingBag size={18} color={foreground} />
            <Text className="font-semibold">Ventes sur DeckDealr</Text>
          </View>
          <Text variant="caption" className="mt-1">
            Prix carte réellement conclu, hors livraison
          </Text>
        </View>
        <Badge variant="secondary">
          {data.sales_volume} vente{data.sales_volume > 1 ? "s" : ""}
        </Badge>
      </View>

      <View className="gap-3">
        <Text className="text-sm font-medium">Ventes comparables</Text>
        <View className="flex-row self-start rounded-xl bg-muted p-1">
          {[
            { label: "Non gradées", value: false },
            { label: "Gradées", value: true },
          ].map((option) => {
            const active = isGraded === option.value;
            return (
              <Pressable
                key={option.label}
                onPress={() => setIsGraded(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className={cn(
                  "rounded-lg px-3 py-2",
                  active && "bg-background",
                )}
              >
                <Text
                  className={cn(
                    "text-sm font-medium text-muted-foreground",
                    active && "text-foreground",
                  )}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isGraded ? (
          <View className="flex-row gap-2">
            <View className="flex-1 gap-1">
              <Text variant="caption">Organisme</Text>
              <Select
                title="Organisme de gradation"
                value={gradingCompany}
                onValueChange={setGradingCompany}
                options={GRADING_OPTIONS}
              />
            </View>
            <View className="flex-1 gap-1">
              <Text variant="caption">Note</Text>
              <Select
                title="Note"
                value={String(gradeNote)}
                onValueChange={(value) => setGradeNote(Number(value))}
                options={GRADE_OPTIONS}
              />
            </View>
          </View>
        ) : (
          <View className="gap-1">
            <Text variant="caption">État</Text>
            <Select
              title="État de la carte"
              value={condition}
              onValueChange={setCondition}
              options={CONDITION_OPTIONS}
            />
          </View>
        )}
      </View>

      {!data.has_sufficient_volume ? (
        <View className="rounded-xl bg-muted/50 p-4">
          <Info size={20} color={mutedForeground} />
          <Text className="mt-2 font-semibold">Historique en constitution</Text>
          <Text variant="muted" className="mt-1">
            Il faut au moins {data.minimum_volume} ventes comparables pour
            afficher une cote fiable. Aucune annonce ni donnée fictive
            n&apos;est utilisée.
          </Text>
        </View>
      ) : (
        <View className="gap-4">
          <View className="flex-row gap-2">
            <View className="flex-1 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <Text variant="caption">Prix médian</Text>
              <Text className="mt-1 text-lg font-bold">
                {formatPrice(data.median_price, data.currency)}
              </Text>
            </View>
            <View className="flex-1 rounded-xl bg-muted/50 p-3">
              <Text variant="caption">Prix moyen</Text>
              <Text className="mt-1 text-lg font-semibold">
                {formatPrice(data.average_price, data.currency)}
              </Text>
            </View>
          </View>

          {data.recent_sales.length > 0 ? (
            <View>
              <View className="mb-2 flex-row items-center gap-2">
                <TrendingUp size={16} color={foreground} />
                <Text className="text-sm font-medium">Ventes récentes</Text>
              </View>
              {data.recent_sales
                .slice(-5)
                .reverse()
                .map((sale) => (
                  <View
                    key={`${sale.sold_at}-${sale.price}`}
                    className="flex-row items-center justify-between border-t border-border py-2"
                  >
                    <Text variant="muted">
                      {new Intl.DateTimeFormat("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      }).format(new Date(sale.sold_at))}
                    </Text>
                    <Text className="font-medium">
                      {formatPrice(sale.price, data.currency)}
                    </Text>
                  </View>
                ))}
            </View>
          ) : null}
        </View>
      )}
    </Card>
  );
}
