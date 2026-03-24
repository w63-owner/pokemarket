"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, BarChart3, Activity, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { queryKeys } from "@/lib/query-keys";
import {
  CONDITION_LABELS,
  CARD_LANGUAGES,
  type CardCondition,
} from "@/lib/constants";

type PriceHistoryProps = {
  cardKey: string;
  condition: string | null;
  language: string | null;
  isGraded: boolean;
};

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

async function fetchPriceHistory(
  cardKey: string,
  condition: string,
  language: string,
  isGraded: boolean,
): Promise<PriceHistoryResponse> {
  const params = new URLSearchParams({
    condition,
    language,
    isGraded: String(isGraded),
  });

  const res = await fetch(
    `/api/cards/${encodeURIComponent(cardKey)}/price-history?${params}`,
  );

  if (!res.ok) {
    throw new Error("Impossible de charger l'historique des prix");
  }

  return res.json();
}

function formatEuro(value: number) {
  return `${value.toFixed(2)} €`;
}

function getVolatilityVariant(v: number) {
  if (v < 10) return "default" as const;
  if (v <= 25) return "secondary" as const;
  return "destructive" as const;
}

function getVolatilityLabel(v: number) {
  if (v < 10) return "Stable";
  if (v <= 25) return "Modérée";
  return "Élevée";
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 shadow-md">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-sm font-semibold">{formatEuro(payload[0].value)}</p>
    </div>
  );
}

export function PriceHistoryChart({
  cardKey,
  condition,
  language,
  isGraded,
}: PriceHistoryProps) {
  const safeCondition = condition ?? "EXCELLENT";
  const languageCanonical = (language ?? "FR").toUpperCase();
  const safeLanguageQuery = languageCanonical.toLowerCase();

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
    return <Skeleton className="mt-6 h-[400px] w-full rounded-xl" />;
  }

  if (isError || !data) {
    return (
      <Card className="mt-6">
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground text-sm">
            Impossible de charger l&apos;historique des prix pour cette carte.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { chartData, stats } = data;

  const prices = chartData.map((d) => d.price);
  const yMin = Math.floor(Math.min(...prices) * 0.9);
  const yMax = Math.ceil(Math.max(...prices) * 1.1);

  return (
    <Card className="mt-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="size-5" />
          Historique des prix
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Cotation estimée pour : {conditionLabel} &bull; {languageLabel} &bull;{" "}
          {isGraded ? "Gradée" : "Non gradée"}
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiBlock
            icon={<BarChart3 className="size-4" />}
            label="Fourchette 12M"
            value={`${formatEuro(stats.range12m[0])} – ${formatEuro(stats.range12m[1])}`}
          />
          <KpiBlock
            icon={<BarChart3 className="size-4" />}
            label="Fourchette 3M"
            value={`${formatEuro(stats.range3m[0])} – ${formatEuro(stats.range3m[1])}`}
          />
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
              <Activity className="size-4" />
              Volatilité
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{stats.volatility}%</span>
              <Badge variant={getVolatilityVariant(stats.volatility)}>
                {getVolatilityLabel(stats.volatility)}
              </Badge>
            </div>
          </div>
          <KpiBlock
            icon={<Eye className="size-4" />}
            label="Observations"
            value={String(stats.observations)}
          />
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}€`}
              className="text-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="price"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#priceGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function KpiBlock({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </div>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
