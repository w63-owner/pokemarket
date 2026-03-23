import { Skeleton } from "@/components/ui/skeleton";

export function ListingCardSkeleton() {
  return (
    <div className="bg-card overflow-hidden rounded-xl shadow-sm">
      <div className="relative aspect-[4/5] overflow-hidden">
        <div
          className="animate-shimmer from-muted via-muted/50 to-muted h-full w-full bg-gradient-to-r"
          style={{ backgroundSize: "200% 100%" }}
        />
      </div>

      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20" />
      </div>
    </div>
  );
}
