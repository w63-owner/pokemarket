import { create } from "zustand";
import type { FeedFilters } from "@pokemarket/shared";

type PendingFeedFiltersState = {
  /**
   * Filter payload waiting to be applied to the home feed. `null` when
   * nothing is pending. Set by external screens (e.g. a saved-search
   * card in Favorites), consumed by the home screen on focus.
   */
  pending: FeedFilters | null;
  /** Replace the current pending filters and queue them for the home feed. */
  setPending: (filters: FeedFilters) => void;
  /** Consume + clear, returning the value the home screen should apply. */
  consume: () => FeedFilters | null;
};

/**
 * Lightweight bridge for "apply these filters when the user lands on the
 * home feed" hand-offs (Sprint 6 — saved search tap in Favorites).
 *
 * We keep it as plain in-memory state (no `persist`) so a force-quit
 * cleanly resets the queue ; the saved search payload itself is the
 * source of truth and the user can always tap again.
 */
export const usePendingFeedFiltersStore = create<PendingFeedFiltersState>(
  (set, get) => ({
    pending: null,
    setPending: (filters) => set({ pending: filters }),
    consume: () => {
      const current = get().pending;
      if (current) set({ pending: null });
      return current;
    },
  }),
);
