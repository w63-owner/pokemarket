import * as Sentry from "@sentry/nextjs";
import {
  buildTcgdexCardImageUrl,
  cardSearchParamsSchema,
  type CardSearchResponse,
  type CardSearchResult,
} from "@deckdealr/shared";
import { NextResponse, type NextRequest } from "next/server";

import { createPublicClient } from "@/lib/supabase/public";

const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600";

function parseSearchQuery(query: string): { name: string; localId?: string } {
  const match = query.match(/^(.*?)\s+(\d+)(?:\s*\/\s*\d+)?\s*$/);
  if (match?.[1] && match[1].trim().length >= 2) {
    return { name: match[1].trim(), localId: match[2] };
  }
  return { name: query };
}

export async function GET(request: NextRequest) {
  const validation = cardSearchParamsSchema.safeParse({
    q: request.nextUrl.searchParams.get("q"),
  });

  if (!validation.success) {
    return NextResponse.json(
      { error: "La recherche doit contenir entre 2 et 80 caractères." },
      { status: 400 },
    );
  }

  try {
    const supabase = createPublicClient();
    const { name, localId } = parseSearchQuery(validation.data.q);
    const { data, error } = await supabase.rpc("match_tcgdex_cards", {
      p_name: name,
      p_language: "fr",
      ...(localId ? { p_local_id: localId } : {}),
    });

    if (error) throw error;

    const seen = new Set<string>();
    const results: CardSearchResult[] = [];

    for (const row of data ?? []) {
      if (!row.card_key || seen.has(row.card_key)) continue;
      seen.add(row.card_key);
      results.push({
        card_key: row.card_key,
        name: row.card_name ?? "Carte inconnue",
        set_id: row.card_set_id ?? null,
        set_name: row.set_name ?? null,
        series_id: row.series_id ?? null,
        series_name: row.series_name ?? null,
        local_id: row.card_local_id ?? null,
        set_official_count: row.set_official_count ?? null,
        rarity: row.card_rarity ?? null,
        language: row.card_language ?? "fr",
        image_url: buildTcgdexCardImageUrl(
          row.card_language ?? "fr",
          row.series_id ?? null,
          row.card_set_id ?? null,
          row.card_local_id ?? null,
        ),
      });
    }

    const response: CardSearchResponse = { results };
    return NextResponse.json(response, {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "La recherche de cartes est momentanément indisponible." },
      { status: 500 },
    );
  }
}
