"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys, type FeedFilters } from "@/lib/query-keys";
import { fetchListingsFeed, type FeedCursor } from "@/lib/api/listings";

export function useInfiniteFeed(filters: FeedFilters = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.listings.feed(filters),
    queryFn: ({ pageParam }) => fetchListingsFeed(filters, pageParam),
    initialPageParam: undefined as FeedCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}
