import * as Sentry from "@sentry/nextjs";
import {
  buildTcgdexCardImageUrl,
  cardKeySchema,
  parseTcgdexCardmarketPricing,
  type CardMarketDetailResponse,
  type CardmarketVariant,
} from "@pokemarket/shared";
import { NextResponse } from "next/server";

import { createPublicClient } from "@/lib/supabase/public";

const CACHE_CONTROL = "public, s-maxage=1800, stale-while-revalidate=86400";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function getOfficialCount(cardCount: unknown): number | null {
  const official = asRecord(cardCount)?.official;
  return typeof official === "number" && Number.isInteger(official)
    ? official
    : null;
}

function getAvailableVariants(
  variantsValue: unknown,
  pricing: ReturnType<typeof parseTcgdexCardmarketPricing>,
): CardmarketVariant[] {
  const variants = asRecord(variantsValue);
  const available: CardmarketVariant[] = [];

  if (variants?.normal === true) available.push("normal");
  if (variants?.holo === true) available.push("holo");

  if (available.length === 0) {
    if (pricing?.normal.current != null) available.push("normal");
    if (pricing?.holo.current != null) available.push("holo");
  }

  return available.length > 0 ? available : ["normal"];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ card_key: string }> },
) {
  const { card_key: rawCardKey } = await params;
  const parsedCardKey = cardKeySchema.safeParse(rawCardKey);

  if (!parsedCardKey.success) {
    return NextResponse.json(
      { error: "Identifiant de carte invalide." },
      { status: 400 },
    );
  }

  try {
    const supabase = createPublicClient();
    const { data: card, error: cardError } = await supabase
      .from("tcgdex_cards")
      .select(
        "card_key, language, name, set_id, local_id, rarity, illustrator, variants, pricing",
      )
      .eq("card_key", parsedCardKey.data)
      .eq("language", "fr")
      .maybeSingle();

    if (cardError) throw cardError;
    if (!card?.card_key) {
      return NextResponse.json(
        { error: "Carte introuvable." },
        { status: 404 },
      );
    }

    const { data: set, error: setError } = card.set_id
      ? await supabase
          .from("tcgdex_sets")
          .select("id, name, series_id, card_count")
          .eq("language", card.language)
          .eq("id", card.set_id)
          .maybeSingle()
      : { data: null, error: null };

    if (setError) throw setError;

    const { data: series, error: seriesError } = set?.series_id
      ? await supabase
          .from("tcgdex_series")
          .select("id, name")
          .eq("language", card.language)
          .eq("id", set.series_id)
          .maybeSingle()
      : { data: null, error: null };

    if (seriesError) throw seriesError;

    const pricing = parseTcgdexCardmarketPricing(card.pricing);
    const response: CardMarketDetailResponse = {
      card: {
        card_key: card.card_key,
        name: card.name ?? "Carte inconnue",
        set_id: card.set_id,
        set_name: set?.name ?? null,
        series_id: set?.series_id ?? null,
        series_name: series?.name ?? null,
        local_id: card.local_id,
        set_official_count: getOfficialCount(set?.card_count),
        rarity: card.rarity,
        language: card.language,
        illustrator: card.illustrator,
        image_url: buildTcgdexCardImageUrl(
          card.language,
          set?.series_id ?? null,
          card.set_id,
          card.local_id,
          "high",
        ),
        available_variants: getAvailableVariants(card.variants, pricing),
        pricing,
      },
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "La cote de cette carte est momentanément indisponible." },
      { status: 500 },
    );
  }
}
