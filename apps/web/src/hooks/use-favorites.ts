"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getFavoriteListingIds,
  getFavoriteListings,
  toggleFavoriteListing,
  getFavoriteSellers,
  unfollowSeller,
  type FavoriteSellerRow,
} from "@/lib/api/favorites";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import type { FeedItem } from "@/types";

export function useFavoriteListings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.favorites.listings(),
    queryFn: getFavoriteListings,
    enabled: !!user,
    staleTime: 60_000,
  });
}

export function useFavorites() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: favoriteIds = [], isLoading } = useQuery({
    queryKey: queryKeys.favorites.listingIds(),
    queryFn: getFavoriteListingIds,
    enabled: !!user,
    staleTime: 60_000,
  });

  const { mutate: toggleFavorite } = useMutation({
    mutationFn: ({
      listingId,
      isFavorite,
    }: {
      listingId: string;
      isFavorite: boolean;
    }) => toggleFavoriteListing(listingId, isFavorite),

    onMutate: async ({ listingId, isFavorite }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.favorites.listingIds(),
      });
      await queryClient.cancelQueries({
        queryKey: queryKeys.favorites.listings(),
      });

      const previousIds = queryClient.getQueryData<string[]>(
        queryKeys.favorites.listingIds(),
      );
      const previousListings = queryClient.getQueryData<FeedItem[]>(
        queryKeys.favorites.listings(),
      );

      queryClient.setQueryData<string[]>(
        queryKeys.favorites.listingIds(),
        (old = []) =>
          isFavorite
            ? old.filter((id) => id !== listingId)
            : [...old, listingId],
      );

      if (isFavorite) {
        queryClient.setQueryData<FeedItem[]>(
          queryKeys.favorites.listings(),
          (old = []) => old.filter((listing) => listing.id !== listingId),
        );
      }

      return { previousIds, previousListings };
    },

    onError: (_error, _variables, context) => {
      if (context?.previousIds) {
        queryClient.setQueryData(
          queryKeys.favorites.listingIds(),
          context.previousIds,
        );
      }
      if (context?.previousListings) {
        queryClient.setQueryData(
          queryKeys.favorites.listings(),
          context.previousListings,
        );
      }
      toast.error("Impossible de modifier les favoris. Réessayez.");
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.favorites.listingIds(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.favorites.listings(),
      });
    },
  });

  function handleToggle(listingId: string) {
    if (!user) {
      toast("Connectez-vous pour ajouter aux favoris", {
        action: {
          label: "Se connecter",
          onClick: () => {
            window.location.href = "/auth";
          },
        },
      });
      return;
    }
    const isFavorite = favoriteIds.includes(listingId);
    toggleFavorite({ listingId, isFavorite });
  }

  return {
    favoriteIds,
    isLoading,
    isFavorite: (listingId: string) => favoriteIds.includes(listingId),
    toggleFavorite: handleToggle,
  };
}

export function useFavoriteSellers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.favorites.sellers(),
    queryFn: getFavoriteSellers,
    enabled: !!user,
    staleTime: 60_000,
  });
}

export function useUnfollowSeller() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sellerId: string) => unfollowSeller(sellerId),

    onMutate: async (sellerId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.favorites.sellers(),
      });

      const previous = queryClient.getQueryData<FavoriteSellerRow[]>(
        queryKeys.favorites.sellers(),
      );

      queryClient.setQueryData<FavoriteSellerRow[]>(
        queryKeys.favorites.sellers(),
        (old = []) => old.filter((s) => s.seller_id !== sellerId),
      );

      return { previous };
    },

    onError: (_error, _sellerId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.favorites.sellers(),
          context.previous,
        );
      }
      toast.error("Impossible de se désabonner. Réessayez.");
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.favorites.sellers(),
      });
    },
  });
}
