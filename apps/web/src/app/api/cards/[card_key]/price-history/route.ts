import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  calcPriceSeller,
  cardKeySchema,
  parseTcgdexCardmarketPricing,
  type CardmarketVariant,
  type PriceHistoryPeriod,
  type PriceHistoryPoint,
  type PriceHistoryResponse,
} from "@deckdealr/shared";
import { createClient } from "@/lib/supabase/server";

const CONDITION_MULTIPLIER: Record<string, number> = {
  MINT: 1.5,
  NEAR_MINT: 1.2,
  EXCELLENT: 1.0,
  GOOD: 0.8,
  LIGHT_PLAYED: 0.7,
  PLAYED: 0.5,
  POOR: 0.3,
};

const GRADED_MULTIPLIER = 2.5;
const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";
const SOURCE = "CARDMARKET_TCGDEX";
const PERIOD_DAYS: Record<Exclude<PriceHistoryPeriod, "all">, number> = {
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

function parseVariant(value: string | null): CardmarketVariant | null {
  return value === "normal" || value === "holo" ? value : null;
}

function parsePeriod(value: string | null): PriceHistoryPeriod | null {
  return value === "30d" || value === "90d" || value === "1y" || value === "all"
    ? value
    : null;
}

function cutoffFor(period: PriceHistoryPeriod, now: Date): string | null {
  if (period === "all") return null;
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - PERIOD_DAYS[period]);
  return cutoff.toISOString().slice(0, 10);
}

function availablePeriods(
  rows: Array<{ snapshot_date: string }>,
  now: Date,
): PriceHistoryPeriod[] {
  if (rows.length === 0) return [];
  const first = new Date(`${rows[0].snapshot_date}T00:00:00.000Z`);
  const ageDays = Math.floor((now.getTime() - first.getTime()) / 86_400_000);
  const periods: PriceHistoryPeriod[] = ["30d"];
  if (ageDays >= 30) periods.push("90d");
  if (ageDays >= 90) periods.push("1y");
  if (ageDays >= 365) periods.push("all");
  return periods;
}

export function computePriceHistoryStats(chartData: PriceHistoryPoint[]) {
  const prices = chartData.map((d) => d.price);
  if (prices.length === 0) {
    return { range: null, observations: 0, volatility: 0 };
  }

  const mean = prices.reduce((s, v) => s + v, 0) / prices.length;
  const variance =
    prices.reduce((s, v) => s + (v - mean) ** 2, 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const volatility = mean > 0 ? Math.round((stdDev / mean) * 1000) / 10 : 0;

  return {
    range: [
      Math.round(Math.min(...prices) * 100) / 100,
      Math.round(Math.max(...prices) * 100) / 100,
    ] as [number, number],
    observations: prices.length,
    volatility,
  };
}

function toChartData(
  rows: Array<{ price: number; snapshot_date: string }>,
  period: PriceHistoryPeriod,
  now: Date,
): PriceHistoryPoint[] {
  const cutoff = cutoffFor(period, now);
  return rows
    .filter((row) => cutoff === null || row.snapshot_date >= cutoff)
    .map((row) => ({
      date: row.snapshot_date,
      price: Number(row.price),
    }))
    .filter(
      (row): row is PriceHistoryPoint =>
        Number.isFinite(row.price) && row.price > 0,
    );
}

function errorResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ card_key: string }> },
) {
  try {
    const { card_key: rawCardKey } = await params;
    const cardKey = cardKeySchema.safeParse(rawCardKey);
    const rawVariant = request.nextUrl.searchParams.get("variant");
    const rawPeriod = request.nextUrl.searchParams.get("period");
    const variant = parseVariant(rawVariant) ?? "normal";
    const period = parsePeriod(rawPeriod) ?? "1y";

    if (!cardKey.success)
      return errorResponse("Identifiant de carte invalide.");
    if (rawVariant !== null && parseVariant(rawVariant) === null) {
      return errorResponse("Variante de carte invalide.");
    }
    if (rawPeriod !== null && parsePeriod(rawPeriod) === null) {
      return errorResponse("Période d'historique invalide.");
    }

    const { searchParams } = request.nextUrl;
    const condition = searchParams.get("condition") ?? "EXCELLENT";
    const languageCanonical = (
      searchParams.get("language") ?? "FR"
    ).toUpperCase();
    const isGraded = searchParams.get("isGraded") === "true";
    const supabase = await createClient();

    const [cardResult, listingsResult, historyResult] = await Promise.all([
      supabase
        .from("tcgdex_cards")
        .select("pricing")
        .eq("card_key", cardKey.data)
        .limit(1)
        .maybeSingle(),
      (() => {
        let query = supabase
          .from("listings")
          .select("display_price")
          .eq("card_ref_id", cardKey.data)
          .eq("status", "ACTIVE")
          .eq("is_graded", isGraded)
          .eq("card_language", languageCanonical)
          .limit(50);
        if (!isGraded) query = query.eq("condition", condition);
        return query;
      })(),
      supabase
        .from("card_price_history")
        .select("price,snapshot_date,currency")
        .eq("card_key", cardKey.data)
        .eq("variant", variant)
        .eq("source", SOURCE)
        .eq("language", "fr")
        .eq("is_graded", false)
        .order("snapshot_date", { ascending: true })
        .limit(2000),
    ]);

    if (cardResult.error) throw cardResult.error;
    if (listingsResult.error) throw listingsResult.error;
    if (historyResult.error) throw historyResult.error;

    const marketPricing = parseTcgdexCardmarketPricing(
      cardResult.data?.pricing,
    );
    const marketBasePrice = marketPricing?.[variant].current ?? null;
    const conditionMul = CONDITION_MULTIPLIER[condition] ?? 1;
    const targetPrice =
      marketBasePrice == null
        ? null
        : Math.round(
            marketBasePrice *
              conditionMul *
              (isGraded ? GRADED_MULTIPLIER : 1) *
              100,
          ) / 100;
    const comparablePrices = (listingsResult.data ?? [])
      .map((listing) => Number(listing.display_price))
      .filter((price) => Number.isFinite(price) && price > 0);
    const comparableDisplayPrice =
      comparablePrices.length === 0
        ? null
        : Math.round(
            (comparablePrices.reduce((sum, price) => sum + price, 0) /
              comparablePrices.length) *
              100,
          ) / 100;
    const recommendation =
      comparableDisplayPrice != null
        ? {
            sellerPrice: calcPriceSeller(comparableDisplayPrice),
            displayPrice: comparableDisplayPrice,
            source: "thedeckdealr" as const,
            sampleSize: comparablePrices.length,
          }
        : targetPrice != null
          ? {
              sellerPrice: calcPriceSeller(targetPrice),
              displayPrice: targetPrice,
              source: "cardmarket" as const,
              sampleSize: null,
            }
          : null;

    const rows = (historyResult.data ?? []).map((row) => ({
      currency: row.currency,
      price: Number(row.price),
      snapshot_date: row.snapshot_date,
    }));
    const now = new Date();
    const chartData = toChartData(rows, period, now);
    const response: PriceHistoryResponse = {
      chartData,
      stats: computePriceHistoryStats(chartData),
      availablePeriods: availablePeriods(rows, now),
      currency: rows.at(-1)?.currency ?? marketPricing?.currency ?? "EUR",
      historyStatus:
        chartData.length === 0
          ? "empty"
          : chartData.length === 1
            ? "single"
            : "ready",
      period,
      recommendation,
      source: SOURCE,
      variant,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[price-history] Error:", err);
    return NextResponse.json(
      { error: "Erreur lors du chargement de l'historique des prix" },
      { status: 500 },
    );
  }
}
