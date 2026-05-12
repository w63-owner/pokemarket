"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchMyProfile } from "@/lib/api/profile";
import { updateProfileAction } from "@/actions/profile";
import type { Profile } from "@/types";
import { toast } from "sonner";

export function useMyProfile() {
  return useQuery({
    queryKey: queryKeys.profile.me(),
    queryFn: fetchMyProfile,
    staleTime: 5 * 60_000,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      updates: Partial<
        Pick<
          Profile,
          | "username"
          | "bio"
          | "avatar_url"
          | "country_code"
          | "address_line"
          | "city"
          | "postal_code"
          | "instagram_url"
          | "facebook_url"
          | "tiktok_url"
        >
      >,
    ): Promise<Profile> => {
      const result = await updateProfileAction(updates);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data: Profile) => {
      queryClient.setQueryData(queryKeys.profile.me(), data);
      toast.success("Profil mis à jour");
    },
    onError: () => {
      toast.error("Erreur lors de la mise à jour du profil");
    },
  });
}
