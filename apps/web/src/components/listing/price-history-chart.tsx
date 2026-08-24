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
import { TrendingUp, BarChart3, Activity, Eye, Info } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  queryKeys,
  type CardmarketVariant,
  type PriceHistoryPeriod,
  type PriceHistoryResponse,
} from "@deckdealr/shared";
import { useState } from "react";

type PriceHistoryProps = {
  cardKey: string;
  variant?: CardmarketVariant | null;
};

const PERIOD_LABELS: Record<PriceHistoryPeriod, string> = {
  "30d": "30 j",
  "90d": "3 mois",
  "1y": "1 an",
  all: "Tout",
};

async function fetchPriceHistory(
  cardKey: string,
  variant: CardmarketVariant,
  period: PriceHistoryPeriod,
): Promise<PriceHistoryResponse> {
  const params = new URLSearchParams({ variant, period });

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
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
  variant: requestedVariant,
}: PriceHistoryProps) {
  const variant = requestedVariant ?? "normal";
  const [period, setPeriod] = useState<PriceHistoryPeriod>("30d");

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.priceHistory(cardKey, variant, period),
    queryFn: () => fetchPriceHistory(cardKey, variant, period),
    staleTime: 5 * 60 * 1000,
  });

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
  const variantLabel = data.variant === "holo" ? "Holographique" : "Normale";

  if (data.historyStatus !== "ready") {
    return (
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="size-5" aria-hidden="true" />
            Historique Cardmarket
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/40 rounded-xl p-5 text-center">
            <Info
              className="text-muted-foreground mx-auto size-6"
              aria-hidden="true"
            />
            <p className="mt-2 font-medium">Historique en constitution</p>
            <p className="text-muted-foreground mx-auto mt-1 max-w-lg text-sm">
              {data.historyStatus === "single"
                ? "Un premier relevé réel est disponible. La courbe apparaîtra après le prochain snapshot quotidien."
                : "Aucun snapshot réel n’est encore disponible pour cette variante. Aucune extrapolation n’est affichée."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const prices = chartData.map((d) => d.price);
  const yMin = Math.max(0, Math.floor(Math.min(...prices) * 0.9));
  const yMax = Math.ceil(Math.max(...prices) * 1.1);

  return (
    <Card className="mt-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="size-5" />
          Historique Cardmarket
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Snapshots quotidiens réels · Variante {variantLabel.toLowerCase()} ·
          Carte française non gradée
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Période de l’historique"
        >
          {(["30d", "90d", "1y", "all"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={period === value ? "default" : "outline"}
              disabled={!data.availablePeriods.includes(value)}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {PERIOD_LABELS[value]}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <KpiBlock
            icon={<BarChart3 className="size-4" />}
            label={`Fourchette ${PERIOD_LABELS[period]}`}
            value={
              stats.range
                ? `${formatEuro(stats.range[0])} – ${formatEuro(stats.range[1])}`
                : "Indisponible"
            }
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

        <div
          role="img"
          aria-label={`Graphique d'évolution du prix : de ${formatEuro(prices[0])} à ${formatEuro(prices[prices.length - 1])} sur ${chartData.length} points`}
        >
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
                tickFormatter={formatDate}
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
              <Tooltip
                labelFormatter={(label) => formatDate(String(label))}
                content={<CustomTooltip />}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#priceGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="sr-only">
          Le prix Cardmarket a évolué de {formatEuro(prices[0])} à{" "}
          {formatEuro(prices[prices.length - 1])} sur {chartData.length} relevés
          réels. Volatilité : {stats.volatility}% (
          {getVolatilityLabel(stats.volatility)}).
        </p>
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
