import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@pokemarket/shared";
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
    // IDs are tiny (string[]) and only change on explicit toggle, which
    // already runs an optimistic update + onSettled invalidate — a long
    // staleTime here lets the feed skip a network round-trip every time
    // it remounts.
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
    mutationFn: (listingId: string) => toggleFavoriteListing(listingId),
    onMutate: async (listingId) => {
      await qc.cancelQueries({ queryKey: queryKeys.favorites.listingIds() });
      const previous = qc.getQueryData<string[]>(
        queryKeys.favorites.listingIds(),
      );
      qc.setQueryData<string[]>(queryKeys.favorites.listingIds(), (old = []) =>
        old.includes(listingId)
          ? old.filter((id) => id !== listingId)
          : [...old, listingId],
      );
      // Fire haptic on the optimistic flip so it feels instant — even if the
      // backend rejects we've already given the tap feedback.
      haptic("tap");
      return { previous };
    },
    onError: (_err, _listingId, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(queryKeys.favorites.listingIds(), ctx.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.favorites.listings() });
      qc.invalidateQueries({ queryKey: queryKeys.favorites.listingIds() });
    },
  });
}
