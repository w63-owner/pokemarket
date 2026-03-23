import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { subMonths, format } from "date-fns";

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
const FALLBACK_PRICE = 15;
const HISTORY_MONTHS = 12;

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function extractBasePrice(pricing: unknown): number {
  if (!pricing || typeof pricing !== "object") return FALLBACK_PRICE;

  const p = pricing as Record<string, unknown>;
  const cardmarket = p.cardmarket as Record<string, unknown> | undefined;
  const prices = cardmarket?.prices as Record<string, unknown> | undefined;

  const trend = prices?.trendPrice ?? cardmarket?.trendPrice;
  if (typeof trend === "number" && trend > 0) return trend;

  const avg = prices?.averageSellPrice ?? cardmarket?.averageSellPrice;
  if (typeof avg === "number" && avg > 0) return avg;

  return FALLBACK_PRICE;
}

function generateMockHistory(
  targetPrice: number,
  cardKey: string,
  condition: string,
  language: string,
): { date: string; price: number }[] {
  const seed = hashCode(`${cardKey}-${condition}-${language}`);
  const rng = seededRandom(seed);

  const now = new Date();
  const points: { date: string; price: number }[] = [];

  let price = targetPrice;
  const rawPoints: number[] = [price];

  for (let i = 1; i < HISTORY_MONTHS; i++) {
    const drift = 0.05 + rng() * 0.1;
    const direction = rng() > 0.5 ? 1 : -1;
    price = price * (1 + direction * drift);
    price = Math.max(price, 0.5);
    rawPoints.unshift(price);
  }

  for (let i = 0; i < HISTORY_MONTHS; i++) {
    const date = subMonths(now, HISTORY_MONTHS - 1 - i);
    points.push({
      date: format(date, "MMM yy"),
      price: Math.round(rawPoints[i] * 100) / 100,
    });
  }

  return points;
}

function computeStats(chartData: { date: string; price: number }[]) {
  const prices = chartData.map((d) => d.price);
  const prices3m = prices.slice(-3);

  const min12 = Math.min(...prices);
  const max12 = Math.max(...prices);
  const min3 = Math.min(...prices3m);
  const max3 = Math.max(...prices3m);

  const mean = prices.reduce((s, v) => s + v, 0) / prices.length;
  const variance =
    prices.reduce((s, v) => s + (v - mean) ** 2, 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const volatility = mean > 0 ? Math.round((stdDev / mean) * 1000) / 10 : 0;

  return {
    range12m: [
      Math.round(min12 * 100) / 100,
      Math.round(max12 * 100) / 100,
    ] as [number, number],
    range3m: [Math.round(min3 * 100) / 100, Math.round(max3 * 100) / 100] as [
      number,
      number,
    ],
    observations: prices.length,
    volatility,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ card_key: string }> },
) {
  try {
    const { card_key } = await params;

    if (!card_key) {
      return NextResponse.json(
        { error: "card_key est requis" },
        { status: 400 },
      );
    }

    const { searchParams } = request.nextUrl;
    const condition = searchParams.get("condition") ?? "EXCELLENT";
    const language = searchParams.get("language") ?? "fr";
    const isGraded = searchParams.get("isGraded") === "true";

    const supabase = await createClient();

    const { data: card } = await supabase
      .from("tcgdex_cards")
      .select("pricing")
      .eq("card_key", card_key)
      .limit(1)
      .single();

    const basePrice = extractBasePrice(card?.pricing);

    const conditionMul = CONDITION_MULTIPLIER[condition] ?? 1.0;
    const targetPrice =
      Math.round(
        basePrice * conditionMul * (isGraded ? GRADED_MULTIPLIER : 1) * 100,
      ) / 100;

    const { data: realData } = await supabase
      .from("card_price_history")
      .select("price, recorded_at")
      .eq("card_key", card_key)
      .eq("condition", condition)
      .eq("language", language)
      .eq("is_graded", isGraded)
      .order("recorded_at", { ascending: true })
      .limit(HISTORY_MONTHS);

    let chartData: { date: string; price: number }[];

    if (realData && realData.length >= 2) {
      chartData = realData.map((row) => ({
        date: format(new Date(row.recorded_at), "MMM yy"),
        price: Number(row.price),
      }));
    } else {
      chartData = generateMockHistory(
        targetPrice,
        card_key,
        condition,
        language,
      );
    }

    const stats = computeStats(chartData);

    return NextResponse.json({ chartData, stats, targetPrice });
  } catch (err) {
    console.error("[price-history] Error:", err);
    return NextResponse.json(
      { error: "Erreur lors du calcul de l'historique des prix" },
      { status: 500 },
    );
  }
}
