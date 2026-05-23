import { useCallback, useState } from "react";
import type { FeedFilters } from "@pokemarket/shared";

// Re-export the shared helper so existing call sites (`import { useFeedFilters,
// countActiveFilters } from "@/hooks/use-feed-filters"`) keep working without
// having to switch every import to `@pokemarket/shared`.
export { countActiveFilters } from "@pokemarket/shared";

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
