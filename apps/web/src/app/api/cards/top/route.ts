import * as Sentry from "@sentry/nextjs";
import {
  buildTcgdexCardImageUrl,
  type CardMarketTopResponse,
  type CardmarketVariant,
} from "@pokemarket/shared";
import { NextResponse } from "next/server";

import { createPublicClient } from "@/lib/supabase/public";

const CACHE_CONTROL = "public, s-maxage=900, stale-while-revalidate=86400";

function isVariant(value: string): value is CardmarketVariant {
  return value === "normal" || value === "holo";
}

export async function GET() {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("get_current_cardmarket_top", {
      p_language: "fr",
      p_limit: 10,
    });

    if (error) throw error;

    const entries = (data ?? []).flatMap((row) => {
      if (!isVariant(row.variant)) return [];

      return [
        {
          rank: Number(row.rank),
          card_key: row.card_key,
          name: row.card_name,
          set_id: row.card_set_id,
          set_name: row.set_name,
          series_id: row.series_id,
          series_name: row.series_name,
          local_id: row.card_local_id,
          set_official_count: row.set_official_count,
          rarity: row.card_rarity,
          language: row.card_language,
          image_url: buildTcgdexCardImageUrl(
            row.card_language,
            row.series_id,
            row.card_set_id,
            row.card_local_id,
          ),
          variant: row.variant,
          price: Number(row.price),
          currency: row.currency,
          snapshot_date: row.snapshot_date,
          price_updated_at: row.price_updated_at,
        },
      ];
    });

    const response: CardMarketTopResponse = {
      entries,
      snapshot_date: entries[0]?.snapshot_date ?? null,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Le classement Cardmarket est momentanément indisponible." },
      { status: 500 },
    );
  }
}
