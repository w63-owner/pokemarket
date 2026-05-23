import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, type Listing } from "@pokemarket/shared";
import {
  createListing,
  deleteListing,
  fetchListing,
  fetchMyListings,
  fetchOwnedListing,
  fetchSellerListings,
  fetchSellerReputation,
  updateListing,
  type CreateListingInput,
  type UpdateListingInput,
} from "@/lib/api/listings";
import { toast } from "@/components/ui/toast";

export function useListing(id: string) {
  return useQuery({
    queryKey: queryKeys.listings.detail(id),
    queryFn: () => fetchListing(id),
    enabled: !!id,
  });
}

export function useSellerReputation(sellerId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.sellers.reputation(sellerId ?? ""),
    queryFn: () => fetchSellerReputation(sellerId as string),
    enabled: !!sellerId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMyListings() {
  return useQuery({
    queryKey: queryKeys.listings.mine(),
    queryFn: fetchMyListings,
  });
}

export function useSellerListings(sellerId: string) {
  return useQuery({
    queryKey: queryKeys.listings.seller(sellerId),
    queryFn: () => fetchSellerListings(sellerId),
    enabled: !!sellerId,
  });
}

export function useOwnedListing(id: string) {
  return useQuery({
    queryKey: ["listings", "owned", id],
    queryFn: () => fetchOwnedListing(id),
    enabled: !!id,
  });
}

export function useCreateListing() {
  const qc = useQueryClient();
  return useMutation<Listing, Error, CreateListingInput>({
    mutationFn: createListing,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.listings.all });
      qc.invalidateQueries({ queryKey: queryKeys.listings.mine() });
    },
    onError: (err) => toast.error(err.message || "Erreur création annonce"),
  });
}

export function useUpdateListing() {
  const qc = useQueryClient();
  return useMutation<Listing, Error, UpdateListingInput>({
    mutationFn: updateListing,
    onSuccess: (listing) => {
      qc.invalidateQueries({ queryKey: queryKeys.listings.all });
      qc.invalidateQueries({ queryKey: queryKeys.listings.mine() });
      qc.invalidateQueries({ queryKey: queryKeys.listings.detail(listing.id) });
    },
    onError: (err) => toast.error(err.message || "Erreur modification annonce"),
  });
}

export function useDeleteListing() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: deleteListing,
    onSuccess: (_void, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.listings.all });
      qc.invalidateQueries({ queryKey: queryKeys.listings.mine() });
      qc.invalidateQueries({ queryKey: queryKeys.listings.detail(id) });
    },
    onError: (err) => toast.error(err.message || "Erreur suppression annonce"),
  });
}
