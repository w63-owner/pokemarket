import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@pokemarket/shared";
import type { FeedItem } from "@pokemarket/shared";
import {
  fetchFavoriteListingIds,
  fetchFavoriteListings,
  toggleFavoriteListing,
} from "@/lib/api/favorites";
import { haptic } from "@/lib/haptics";

export function useFavoriteListingIds() {
  return useQuery({
    queryKey: queryKeys.favorites.listingIds(),
    queryFn: fetchFavoriteListingIds,
    staleTime: 5 * 60_000,
  });
}

export function useFavoriteListings() {
  return useQuery({
    queryKey: queryKeys.favorites.listings(),
    queryFn: fetchFavoriteListings,
    staleTime: 60_000,
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      listingId,
      isFavorite,
    }: {
      listingId: string;
      isFavorite: boolean;
    }) => toggleFavoriteListing(listingId, isFavorite),
    onMutate: async ({ listingId, isFavorite }) => {
      await qc.cancelQueries({ queryKey: queryKeys.favorites.listingIds() });
      await qc.cancelQueries({ queryKey: queryKeys.favorites.listings() });

      const previous = qc.getQueryData<string[]>(
        queryKeys.favorites.listingIds(),
      );
      const previousListings = qc.getQueryData<FeedItem[]>(
        queryKeys.favorites.listings(),
      );

      qc.setQueryData<string[]>(queryKeys.favorites.listingIds(), (old = []) =>
        isFavorite ? old.filter((id) => id !== listingId) : [...old, listingId],
      );

      if (isFavorite) {
        qc.setQueryData<FeedItem[]>(
          queryKeys.favorites.listings(),
          (old = []) => old.filter((item) => item.id !== listingId),
        );
      }

      haptic("tap");
      return { previous, previousListings };
    },
    onSuccess: (serverResult, { listingId }) => {
      const currentIds =
        qc.getQueryData<string[]>(queryKeys.favorites.listingIds()) ?? [];
      const isInCache = currentIds.includes(listingId);

      if (serverResult && !isInCache) {
        qc.setQueryData<string[]>(queryKeys.favorites.listingIds(), [
          ...currentIds,
          listingId,
        ]);
        qc.invalidateQueries({ queryKey: queryKeys.favorites.listings() });
      } else if (!serverResult && isInCache) {
        qc.setQueryData<string[]>(
          queryKeys.favorites.listingIds(),
          currentIds.filter((id) => id !== listingId),
        );
        qc.setQueryData<FeedItem[]>(
          queryKeys.favorites.listings(),
          (old = []) => old.filter((item) => item.id !== listingId),
        );
      }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(queryKeys.favorites.listingIds(), ctx.previous);
      }
      if (ctx?.previousListings) {
        qc.setQueryData(queryKeys.favorites.listings(), ctx.previousListings);
      }
    },
  });
}
