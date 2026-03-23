"use client";

import { useFiltersFromUrl } from "@/hooks/use-feed-filters";
import { FeedFilters } from "@/components/feed/feed-filters";
import { FeedGrid } from "@/components/feed/feed-grid";

export function HomeFeed() {
  const filters = useFiltersFromUrl();

  return (
    <>
      <FeedFilters />
      <div className="mt-4">
        <FeedGrid filters={filters} />
      </div>
    </>
  );
}
