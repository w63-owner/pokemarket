import { ListingCardSkeleton } from "@/components/feed/listing-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function FavoritesLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-24">
      {/* Title */}
      <Skeleton className="mb-6 h-8 w-32" />

      {/* Tabs */}
      <div className="mx-auto mb-6 grid w-full max-w-md grid-cols-3 gap-2">
        <Skeleton className="h-9 rounded-lg" />
        <Skeleton className="h-9 rounded-lg" />
        <Skeleton className="h-9 rounded-lg" />
      </div>

      {/* Listing grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
