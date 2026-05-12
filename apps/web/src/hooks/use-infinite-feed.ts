"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys, type FeedFilters } from "@/lib/query-keys";
import { fetchListingsFeed, type FeedCursor } from "@/lib/api/listings";
import { useAuth } from "@/hooks/use-auth";

export function useInfiniteFeed(filters: FeedFilters = {}) {
  const { user, loading: authLoading } = useAuth();
  const excludeSellerId = user?.id;

  return useInfiniteQuery({
    queryKey: queryKeys.listings.feed(filters, excludeSellerId),
    queryFn: ({ pageParam }) =>
      fetchListingsFeed(filters, pageParam, undefined, excludeSellerId),
    initialPageParam: undefined as FeedCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
    enabled: !authLoading,
  });
}
