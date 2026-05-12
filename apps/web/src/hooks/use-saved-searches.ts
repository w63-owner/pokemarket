"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSavedSearches,
  createSavedSearch,
  deleteSavedSearch,
  getNewCountsForSavedSearches,
  markSavedSearchSeen,
  type SavedSearchNewCount,
} from "@/lib/api/saved-searches";
import { queryKeys, type FeedFilters } from "@/lib/query-keys";
import { useAuth } from "@/hooks/use-auth";
import type { SavedSearch } from "@/types";
import { toast } from "sonner";

export function useSavedSearches() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.favorites.searches(),
    queryFn: getSavedSearches,
    enabled: !!user,
    staleTime: 60_000,
  });
}

export function useCreateSavedSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, filters }: { name: string; filters: FeedFilters }) =>
      createSavedSearch(name, filters),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.favorites.searches(),
      });
      toast.success("Recherche sauvegardée");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Impossible de sauvegarder la recherche");
    },
  });
}

export function useDeleteSavedSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteSavedSearch(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.favorites.searches(),
      });

      const previous = queryClient.getQueryData<SavedSearch[]>(
        queryKeys.favorites.searches(),
      );

      queryClient.setQueryData<SavedSearch[]>(
        queryKeys.favorites.searches(),
        (old = []) => old.filter((s) => s.id !== id),
      );

      return { previous };
    },

    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.favorites.searches(),
          context.previous,
        );
      }
      toast.error("Impossible de supprimer la recherche. Réessayez.");
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.favorites.searches(),
      });
    },
  });
}

export function useSavedSearchNewCounts() {
  const { user } = useAuth();

  const { data: raw = [] } = useQuery({
    queryKey: queryKeys.favorites.searchNewCounts(),
    queryFn: getNewCountsForSavedSearches,
    enabled: !!user,
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => markSavedSearchSeen(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.favorites.searchNewCounts(),
      });
    },
  });
}
