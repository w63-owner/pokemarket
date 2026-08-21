import * as Sentry from "@sentry/nextjs";
import {
  cardKeySchema,
  type CardmarketVariant,
  type PokeMarketRecentSale,
  type PokeMarketSalesResponse,
} from "@pokemarket/shared";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createPublicClient } from "@/lib/supabase/public";

const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600";
const MINIMUM_VOLUME = 3;

function parseVariant(value: string | null): CardmarketVariant | null {
  return value === "normal" || value === "holo" ? value : null;
}

function parseRecentSales(value: unknown): PokeMarketRecentSale[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];

    const sale = entry as Record<string, unknown>;
    const price = Number(sale.price);
    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      typeof sale.sold_at !== "string"
    ) {
      return [];
    }

    return [
      {
        price,
        sold_at: sale.sold_at,
        variant: parseVariant(
          typeof sale.variant === "string" ? sale.variant : null,
        ),
      },
    ];
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ card_key: string }> },
) {
  const { card_key: rawCardKey } = await params;
  const cardKey = cardKeySchema.safeParse(rawCardKey);
  const rawVariant = request.nextUrl.searchParams.get("variant");
  const variant = parseVariant(rawVariant);

  if (!cardKey.success) {
    return NextResponse.json(
      { error: "Identifiant de carte invalide." },
      { status: 400 },
    );
  }

  if (rawVariant !== null && variant === null) {
    return NextResponse.json(
      { error: "Variante de carte invalide." },
      { status: 400 },
    );
  }

  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("get_pokemarket_sales_summary", {
      p_card_key: cardKey.data,
      p_variant: variant ?? undefined,
      p_limit: 12,
    });

    if (error) throw error;

    const summary = data?.[0];
    const salesVolume = Number(summary?.sales_volume ?? 0);
    const response: PokeMarketSalesResponse = {
      median_price:
        summary?.median_price == null ? null : Number(summary.median_price),
      average_price:
        summary?.average_price == null ? null : Number(summary.average_price),
      sales_volume: salesVolume,
      last_sold_at: summary?.last_sold_at ?? null,
      recent_sales: parseRecentSales(summary?.recent_sales),
      has_sufficient_volume: salesVolume >= MINIMUM_VOLUME,
      minimum_volume: MINIMUM_VOLUME,
      currency: "EUR",
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Les ventes PokeMarket sont momentanément indisponibles." },
      { status: 500 },
    );
  }
}
