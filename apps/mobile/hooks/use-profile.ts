import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, type Profile } from "@pokemarket/shared";
import {
  fetchMyProfile,
  fetchPublicProfile,
  fetchSellerReviews,
  followSeller,
  isFollowingSeller,
  unfollowSeller,
  updateMyProfile,
  type ProfileUpdateInput,
} from "@/lib/api/profile";
import { toast } from "@/components/ui";
import { haptics } from "@/lib/haptics";

export function useMyProfile() {
  return useQuery({
    queryKey: queryKeys.profile.me(),
    queryFn: fetchMyProfile,
    staleTime: 5 * 60_000,
  });
}

export function usePublicProfile(username: string) {
  return useQuery({
    queryKey: queryKeys.profile.public(username),
    queryFn: () => fetchPublicProfile(username),
    enabled: !!username,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();

  return useMutation<Profile, Error, ProfileUpdateInput>({
    mutationFn: updateMyProfile,
    onSuccess: (next) => {
      qc.setQueryData(queryKeys.profile.me(), next);
      // The public-profile query is keyed by username; if the user
      // changed it we'll naturally fetch the new one on next view.
      qc.invalidateQueries({ queryKey: ["profile", "public"] });
      toast.success("Profil mis à jour");
    },
    onError: (err) => {
      toast.error(
        "Erreur lors de la mise à jour",
        err.message ?? "Veuillez réessayer.",
      );
    },
  });
}

export function useSellerReviews(sellerId: string) {
  return useQuery({
    queryKey: queryKeys.reviews.bySeller(sellerId),
    queryFn: () => fetchSellerReviews(sellerId),
    enabled: !!sellerId,
    staleTime: 60_000,
  });
}

export function useSellerFollowStatus(sellerId: string) {
  return useQuery({
    queryKey: queryKeys.sellers.followStatus(sellerId),
    queryFn: () => isFollowingSeller(sellerId),
    enabled: !!sellerId,
  });
}

/**
 * Optimistically toggles whether the current user follows `sellerId`,
 * fires a light haptic on the flip, and rolls back on error.
 */
export function useToggleFollow(sellerId: string) {
  const qc = useQueryClient();
  const key = queryKeys.sellers.followStatus(sellerId);

  return useMutation({
    mutationFn: async (nextFollowing: boolean) => {
      if (nextFollowing) {
        await followSeller(sellerId);
      } else {
        await unfollowSeller(sellerId);
      }
      return nextFollowing;
    },
    onMutate: async (nextFollowing) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<boolean>(key);
      qc.setQueryData(key, nextFollowing);
      haptics.light();
      return { previous };
    },
    onError: (err, _next, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.previous);
      const message = err instanceof Error ? err.message : "Erreur";
      toast.error("Action impossible", message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: queryKeys.favorites.sellers() });
    },
  });
}
