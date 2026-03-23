"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  createListing,
  updateListing,
  type CreateListingInput,
  type UpdateListingInput,
} from "@/lib/api/listings";
import type { Listing } from "@/types";
import { toast } from "sonner";

export function useCreateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateListingInput) => createListing(data),
    onSuccess: (_data: Listing) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.mine() });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erreur lors de la création de l'annonce");
    },
  });
}

export function useUpdateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateListingInput) => updateListing(data),
    onSuccess: (listing: Listing) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.mine() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.listings.detail(listing.id),
      });
    },
    onError: (error: Error) => {
      toast.error(
        error.message || "Erreur lors de la modification de l'annonce",
      );
    },
  });
}
