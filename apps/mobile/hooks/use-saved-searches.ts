import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  queryKeys,
  type FeedFilters,
  type SavedSearch,
} from "@pokemarket/shared";

import {
  createSavedSearch,
  deleteSavedSearch,
  fetchSavedSearches,
  fetchSavedSearchNewCounts,
  markSavedSearchSeen,
  type SavedSearchNewCount,
} from "@/lib/api/saved-searches";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/components/ui/toast";

export function useSavedSearches() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.favorites.searches(),
    queryFn: fetchSavedSearches,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}

export function useCreateSavedSearch() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ name, filters }: { name: string; filters: FeedFilters }) =>
      createSavedSearch(name, filters),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.favorites.searches() });
      toast.success("Recherche sauvegardée");
    },
    onError: (error: Error) => {
      toast.error("Impossible de sauvegarder", error.message);
    },
  });
}

export function useDeleteSavedSearch() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteSavedSearch(id),

    // Optimistic remove — the user gets instant feedback, and we roll back
    // if the server rejects (covered by `onError`).
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.favorites.searches() });

      const previous = qc.getQueryData<SavedSearch[]>(
        queryKeys.favorites.searches(),
      );

      qc.setQueryData<SavedSearch[]>(
        queryKeys.favorites.searches(),
        (old = []) => old.filter((s) => s.id !== id),
      );

      return { previous };
    },

    onError: (_error, _id, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.favorites.searches(), context.previous);
      }
      toast.error("Impossible de supprimer la recherche");
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.favorites.searches() });
    },
  });
}

export function useSavedSearchNewCounts() {
  const { isAuthenticated } = useAuth();

  const { data: raw = [] } = useQuery({
    queryKey: queryKeys.favorites.searchNewCounts(),
    queryFn: fetchSavedSearchNewCounts,
    enabled: isAuthenticated,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const countsMap = useMemo(
    () =>
      new Map(raw.map((r: SavedSearchNewCount) => [r.search_id, r.new_count])),
    [raw],
  );

  const totalNew = useMemo(
    () =>
      raw.reduce((sum: number, r: SavedSearchNewCount) => sum + r.new_count, 0),
    [raw],
  );

  return { countsMap, totalNew };
}

export function useMarkSavedSearchSeen() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => markSavedSearchSeen(id),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: queryKeys.favorites.searchNewCounts(),
      });
    },
  });
}
