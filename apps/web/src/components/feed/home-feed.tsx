"use client";

import { FEATURE_FLAGS } from "@deckdealr/shared";
import { useFiltersFromUrl } from "@/hooks/use-feed-filters";
import { useFeatureFlag } from "@/hooks/use-feature-flags";
import { FeedFilters } from "@/components/feed/feed-filters";
import { FeedGrid } from "@/components/feed/feed-grid";

export function HomeFeed() {
  const filters = useFiltersFromUrl();
  const { enabled: searchEnabled } = useFeatureFlag(FEATURE_FLAGS.HOME_SEARCH);

  return (
    <>
      <FeedFilters showSearch={searchEnabled} />
      <div className="mt-4">
        <FeedGrid filters={filters} />
      </div>
    </>
  );
}
