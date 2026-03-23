"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchMyProfile, updateMyProfile } from "@/lib/api/profile";
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
    mutationFn: updateMyProfile,
    onSuccess: (data: Profile) => {
      queryClient.setQueryData(queryKeys.profile.me(), data);
      toast.success("Profil mis à jour");
    },
    onError: () => {
      toast.error("Erreur lors de la mise à jour du profil");
    },
  });
}
