import { supabase } from "@/lib/supabase";

const MIN_QUERY_LENGTH = 2;
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

/**
 * Parse a free-form query like "Dracaufeu 11/25" into a name + optional
 * trailing card number. Mirrors the PWA implementation so autocomplete
 * behaves identically across platforms.
 */
export function parseCardQuery(raw: string): {
  name: string;
  localId?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { name: "" };
  const match = trimmed.match(/^(.*?)\s+(\d+)(?:\s*\/\s*\d+)?\s*$/);
  if (match && match[1].trim().length >= MIN_QUERY_LENGTH) {
    return { name: match[1].trim(), localId: match[2] };
  }
  return { name: trimmed };
}

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
  if (name.length < MIN_QUERY_LENGTH) return [];

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

export const CARD_SEARCH_MIN_LENGTH = MIN_QUERY_LENGTH;
