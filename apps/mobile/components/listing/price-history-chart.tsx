import { useMemo } from "react";
import { View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { TrendingUp, BarChart3, Activity, Eye } from "lucide-react-native";
import {
  CONDITION_LABELS,
  CARD_LANGUAGES,
  queryKeys,
  type CardCondition,
} from "@pokemarket/shared";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Text,
} from "@/components/ui";
import { api } from "@/lib/api/client";
import { useThemeColor } from "@/lib/theme-colors";

type ChartPoint = { date: string; price: number };

type PriceHistoryResponse = {
  chartData: ChartPoint[];
  stats: {
    range12m: [number, number];
    range3m: [number, number];
    observations: number;
    volatility: number;
  };
  targetPrice: number;
};

type Props = {
  cardKey: string;
  condition: string | null;
  language: string | null;
  isGraded: boolean;
};

function formatEuro(value: number) {
  return `${value.toFixed(2)} €`;
}

function getVolatilityVariant(
  v: number,
): "default" | "secondary" | "destructive" {
  if (v < 10) return "default";
  if (v <= 25) return "secondary";
  return "destructive";
}

function getVolatilityLabel(v: number) {
  if (v < 10) return "Stable";
  if (v <= 25) return "Modérée";
  return "Élevée";
}

async function fetchPriceHistory(
  cardKey: string,
  condition: string,
  language: string,
  isGraded: boolean,
): Promise<PriceHistoryResponse> {
  return api.get<PriceHistoryResponse>(
    `/api/cards/${encodeURIComponent(cardKey)}/price-history`,
    {
      searchParams: { condition, language, isGraded },
      authenticated: false,
    },
  );
}

/**
 * Listing price history — mirrors the web `PriceHistoryChart` :
 *
 *   - Same RQ key (`queryKeys.priceHistory`) for cache hits when the
 *     two platforms share a Supabase project ;
 *   - Same KPI grid (12M range, 3M range, volatility, observations) ;
 *   - Area chart drawn with `react-native-svg` paths — avoids the
 *     `@shopify/react-native-skia` native dep that `victory-native`
 *     v41 now requires (heavier and forces a prebuild) while still
 *     producing the same gradient fill + stroke the web ships.
 */
export function PriceHistoryChart({
  cardKey,
  condition,
  language,
  isGraded,
}: Props) {
  const safeCondition = condition ?? "EXCELLENT";
  const languageCanonical = (language ?? "FR").toUpperCase();
  const safeLanguageQuery = languageCanonical.toLowerCase();
  const foreground = useThemeColor("foreground");
  const mutedForeground = useThemeColor("mutedForeground");

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.priceHistory(
      cardKey,
      safeCondition,
      languageCanonical,
      isGraded,
    ),
    queryFn: () =>
      fetchPriceHistory(cardKey, safeCondition, safeLanguageQuery, isGraded),
    staleTime: 5 * 60 * 1000,
  });

  const conditionLabel =
    CONDITION_LABELS[safeCondition as CardCondition] ?? safeCondition;
  const languageLabel =
    CARD_LANGUAGES.find((l) => l.value === languageCanonical)?.label ??
    languageCanonical;

  if (isLoading) {
    return <Skeleton className="mt-2 h-72 w-full rounded-2xl" />;
  }

  if (isError || !data) {
    return (
      <Card className="mt-2">
        <CardContent>
          <Text variant="muted">
            Impossible de charger l&apos;historique des prix pour cette carte.
          </Text>
        </CardContent>
      </Card>
    );
  }

  const { chartData, stats } = data;
  if (chartData.length < 2) return null;

  return (
    <Card className="mt-2">
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <TrendingUp size={18} color={foreground} />
          <CardTitle>Historique des prix</CardTitle>
        </View>
        <Text variant="muted">
          Cotation estimée : {conditionLabel} • {languageLabel} •{" "}
          {isGraded ? "Gradée" : "Non gradée"}
        </Text>
      </CardHeader>

      <CardContent className="gap-4">
        <View className="flex-row flex-wrap gap-2">
          <KpiBlock
            icon={<BarChart3 size={14} color={mutedForeground} />}
            label="Fourchette 12M"
            value={`${formatEuro(stats.range12m[0])} – ${formatEuro(stats.range12m[1])}`}
          />
          <KpiBlock
            icon={<BarChart3 size={14} color={mutedForeground} />}
            label="Fourchette 3M"
            value={`${formatEuro(stats.range3m[0])} – ${formatEuro(stats.range3m[1])}`}
          />
          <KpiBlock
            icon={<Activity size={14} color={mutedForeground} />}
            label="Volatilité"
            value={
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-semibold">
                  {stats.volatility}%
                </Text>
                <Badge variant={getVolatilityVariant(stats.volatility)}>
                  {getVolatilityLabel(stats.volatility)}
                </Badge>
              </View>
            }
          />
          <KpiBlock
            icon={<Eye size={14} color={mutedForeground} />}
            label="Observations"
            value={String(stats.observations)}
          />
        </View>

        <AreaChart points={chartData} />
      </CardContent>
    </Card>
  );
}

const CHART_HEIGHT = 220;
const CHART_PADDING = { top: 16, right: 12, bottom: 28, left: 36 };

function AreaChart({ points }: { points: ChartPoint[] }) {
  const { width: screenWidth } = useWindowDimensions();
  // Card padding (16) on each side + a comfortable inner gutter so
  // the chart doesn't bleed under the rounded card edge.
  const width = Math.max(240, screenWidth - 64);
  const primary = useThemeColor("primary");
  const mutedForeground = useThemeColor("mutedForeground");

  const { areaPath, linePath, yTicks, xLabels } = useMemo(() => {
    const prices = points.map((p) => p.price);
    const yMin = Math.floor(Math.min(...prices) * 0.9);
    const yMax = Math.ceil(Math.max(...prices) * 1.1);
    const yRange = Math.max(yMax - yMin, 1);

    const innerWidth = width - CHART_PADDING.left - CHART_PADDING.right;
    const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

    const xStep = points.length > 1 ? innerWidth / (points.length - 1) : 0;

    const xy = points.map((p, i) => {
      const x = CHART_PADDING.left + i * xStep;
      const y =
        CHART_PADDING.top + (1 - (p.price - yMin) / yRange) * innerHeight;
      return { x, y };
    });

    const linePath = xy
      .map(
        (pt, i) =>
          `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`,
      )
      .join(" ");

    const baselineY = CHART_PADDING.top + innerHeight;
    const areaPath =
      `${linePath} ` +
      `L${xy[xy.length - 1].x.toFixed(1)},${baselineY} ` +
      `L${xy[0].x.toFixed(1)},${baselineY} Z`;

    const yTicks = [yMin, Math.round((yMin + yMax) / 2), yMax].map((v) => ({
      value: v,
      y: CHART_PADDING.top + (1 - (v - yMin) / yRange) * innerHeight,
    }));

    // At most 4-5 labels along the X axis so they don't collide.
    const step = Math.max(1, Math.ceil(points.length / 5));
    const xLabels = xy
      .map((pt, i) => ({ x: pt.x, label: points[i].date, idx: i }))
      .filter((_, i) => i % step === 0 || i === points.length - 1);

    return { areaPath, linePath, yTicks, xLabels };
  }, [points, width]);

  return (
    <View>
      <Svg width={width} height={CHART_HEIGHT}>
        <Defs>
          <LinearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={primary} stopOpacity={0.3} />
            <Stop offset="100%" stopColor={primary} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {yTicks.map((tick) => (
          <SvgText
            key={`y-${tick.value}`}
            x={CHART_PADDING.left - 6}
            y={tick.y + 4}
            fill={mutedForeground}
            fontSize={10}
            textAnchor="end"
          >
            {`${tick.value}€`}
          </SvgText>
        ))}

        <Path d={areaPath} fill="url(#priceGradient)" />
        <Path d={linePath} stroke={primary} strokeWidth={2} fill="none" />

        {xLabels.map((tick) => (
          <SvgText
            key={`x-${tick.idx}`}
            x={tick.x}
            y={CHART_HEIGHT - 8}
            fill={mutedForeground}
            fontSize={10}
            textAnchor="middle"
          >
            {tick.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

function KpiBlock({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <View className="min-w-[45%] flex-1 rounded-xl bg-muted/60 p-3">
      <View className="mb-1 flex-row items-center gap-1.5">
        {icon}
        <Text variant="caption">{label}</Text>
      </View>
      {typeof value === "string" ? (
        <Text className="text-sm font-semibold">{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}
