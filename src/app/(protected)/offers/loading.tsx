import { Skeleton } from "@/components/ui/skeleton";

function OfferRowSkeleton() {
  return (
    <div className="flex gap-3 rounded-xl border p-3">
      <Skeleton className="h-20 w-16 shrink-0 rounded-lg" />
      <div className="flex flex-1 flex-col justify-between py-0.5">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function OffersLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl pb-24">
      {/* Header */}
      <header className="bg-background/80 sticky top-0 z-30 border-b px-4 py-3 backdrop-blur-md">
        <Skeleton className="h-7 w-24" />
      </header>

      <div className="px-4 pt-4">
        {/* Tabs */}
        <div className="mb-4 grid w-full grid-cols-2 gap-2">
          <Skeleton className="h-9 rounded-lg" />
          <Skeleton className="h-9 rounded-lg" />
        </div>

        {/* Offer list */}
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <OfferRowSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
