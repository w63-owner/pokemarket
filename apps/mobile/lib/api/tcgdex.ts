import { CARD_SEARCH_MIN_LENGTH, parseCardQuery } from "@pokemarket/shared";
import { supabase } from "@/lib/supabase";

const PREFERRED_LANGUAGE = "fr";

export type CardSuggestion = {
  card_key: string;
  name: string;
  set_id: string | null;
  set_name: string | null;
  series_id: string | null;
  series_name: string | null;
  local_id: string | null;
  set_official_count: number | null;
  language: string;
  image_url: string | null;
};

// Re-export the shared helpers so existing `from "@/lib/api/tcgdex"` imports
// keep working without touching the call sites.
export { CARD_SEARCH_MIN_LENGTH, parseCardQuery };

function buildTcgdexImageUrl(
  setId: string | null,
  seriesId: string | null,
  localId: string | null,
  language: string,
): string | null {
  if (!setId || !seriesId || !localId) return null;
  return `https://assets.tcgdex.net/${language}/${seriesId}/${setId}/${localId}/low.webp`;
}

export async function fetchCardSuggestions(
  query: string,
): Promise<CardSuggestion[]> {
  const { name, localId } = parseCardQuery(query);
  if (name.length < CARD_SEARCH_MIN_LENGTH) return [];

  const { data, error } = await supabase.rpc("match_tcgdex_cards", {
    p_name: name,
    p_language: PREFERRED_LANGUAGE,
    ...(localId ? { p_local_id: localId } : {}),
  });

  if (error) {
    if (__DEV__) console.error("match_tcgdex_cards error:", error);
    return [];
  }
  if (!data) return [];

  const seen = new Set<string>();
  const results: CardSuggestion[] = [];
  for (const row of data) {
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
      language: row.card_language ?? PREFERRED_LANGUAGE,
      image_url: buildTcgdexImageUrl(
        row.card_set_id ?? null,
        row.series_id ?? null,
        row.card_local_id ?? null,
        row.card_language ?? PREFERRED_LANGUAGE,
      ),
    });
  }
  return results;
}
