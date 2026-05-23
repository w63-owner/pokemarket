import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@pokemarket/shared";

import { useAuth } from "@/hooks/use-auth";
import { fetchFavoriteSellers } from "@/lib/api/favorites";

export function useFollowedSellers() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.favorites.sellers(),
    queryFn: fetchFavoriteSellers,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}
