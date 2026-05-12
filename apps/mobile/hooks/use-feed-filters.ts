import { useCallback, useState } from "react";
import type { FeedFilters } from "@pokemarket/shared";

export function useFeedFilters(initial: FeedFilters = {}) {
  const [filters, setFilters] = useState<FeedFilters>(initial);

  const update = useCallback((patch: Partial<FeedFilters>) => {
    setFilters((prev) => {
      const next: FeedFilters = { ...prev };
      for (const [key, value] of Object.entries(patch)) {
        if (
          value === undefined ||
          value === null ||
          value === "" ||
          value === false
        ) {
          delete (next as Record<string, unknown>)[key];
        } else {
          (next as Record<string, unknown>)[key] = value;
        }
      }
      if (!next.is_graded) {
        delete next.grade_min;
        delete next.grade_max;
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => setFilters({}), []);

  return { filters, setFilters, update, reset };
}

/**
 * Counts the user-applied filters (excludes default sort).
 * Mirrors the PWA helper so the badge in the UI matches across platforms.
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
  if (filters.sort && filters.sort !== "date_desc") count++;
  return count;
}
