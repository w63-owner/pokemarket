import type { FeedFilters } from "../query-keys";
import {
  CONDITION_LABELS,
  RARITY_OPTIONS,
  type CardCondition,
} from "../constants";

/**
 * Minimum number of characters required before the card autocomplete RPC
 * is queried. Exposed as a constant so the web and mobile inputs can use
 * the same threshold and avoid hitting Supabase on stray keystrokes.
 */
export const CARD_SEARCH_MIN_LENGTH = 2;

/**
 * Counts the user-applied filters. Mirrors the PWA helper so both
 * platforms display the same badge count for a given filter set. The
 * default sort (`date_desc`) is intentionally NOT counted, matching the
 * web behaviour where only "value-changing" facets contribute to the
 * badge.
 */
export function countActiveFilters(filters: FeedFilters): number {
  let count = 0;
  if (filters.q) count++;
  if (filters.set) count++;
  if (filters.rarity) count++;
  if (filters.condition) count++;
  if (filters.is_graded) count++;
  if (filters.price_min !== undefined) count++;
  if (filters.price_max !== undefined) count++;
  if (filters.card_number) count++;
  if (filters.series) count++;
  return count;
}

/**
 * Parse a free-form query like "Dracaufeu 11/25" into a `name` part and an
 * optional trailing card number. The trailing token is detected as
 * `<num>` or `<num>/<num>`. Names shorter than the minimum length are
 * returned unchanged so callers can decide whether to fire the autocomplete.
 */
export function parseCardQuery(raw: string): {
  name: string;
  localId?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { name: "" };
  const match = trimmed.match(/^(.*?)\s+(\d+)(?:\s*\/\s*\d+)?\s*$/);
  if (match && match[1].trim().length >= CARD_SEARCH_MIN_LENGTH) {
    return { name: match[1].trim(), localId: match[2] };
  }
  return { name: trimmed };
}

const rarityLabelMap: Record<string, string> = Object.fromEntries(
  RARITY_OPTIONS.map((r) => [r.value, r.label]),
);

/**
 * Human-readable summary of active filters, e.g. "Pikachu, Rare, 5–50 €".
 * Used in the SaveSearchDialog description and in the saved searches list.
 */
export function filtersToLabel(filters: FeedFilters): string {
  const parts: string[] = [];

  if (filters.q) parts.push(`"${filters.q}"`);
  if (filters.series) parts.push(filters.series);
  if (filters.set) parts.push(filters.set);
  if (filters.card_number) parts.push(`#${filters.card_number}`);
  if (filters.rarity) {
    parts.push(rarityLabelMap[filters.rarity] ?? filters.rarity);
  }
  if (filters.condition) {
    parts.push(
      CONDITION_LABELS[filters.condition as CardCondition] ?? filters.condition,
    );
  }
  if (filters.is_graded) {
    const g = [filters.grade_min, filters.grade_max].filter(
      (v): v is number => typeof v === "number",
    );
    parts.push(g.length ? `Gradée ${g.join("–")}` : "Gradée");
  }
  if (filters.price_min !== undefined || filters.price_max !== undefined) {
    const min = filters.price_min ?? 0;
    const max = filters.price_max;
    parts.push(max !== undefined ? `${min}–${max} €` : `≥ ${min} €`);
  }

  return parts.join(", ") || "Tous les résultats";
}

/**
 * Suggest a short default name based on the active filters. Used to
 * pre-fill the SaveSearchDialog name input.
 */
export function suggestSearchName(filters: FeedFilters): string {
  const parts: string[] = [];
  if (filters.q) parts.push(filters.q);
  if (filters.set) parts.push(filters.set);
  if (filters.rarity) {
    parts.push(rarityLabelMap[filters.rarity] ?? filters.rarity);
  }
  return parts.join(" ") || "Ma recherche";
}

/**
 * Serializes filters back to a URLSearchParams-style string. Used by the
 * web to push the URL and (in principle) by mobile if a deep-link is ever
 * generated from a saved search.
 */
export function filtersToSearchString(filters: FeedFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== "" &&
      value !== false
    ) {
      params.set(key, String(value));
    }
  }
  return params.toString();
}
