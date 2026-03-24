import { Skeleton } from "@/components/ui/skeleton";

export default function ListingLoading() {
  return (
    <div className="pb-24">
      {/* Image carousel placeholder */}
      <div className="sm:mx-auto sm:mt-4 sm:max-w-2xl sm:rounded-2xl">
        <Skeleton className="aspect-square w-full sm:rounded-2xl" />
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl px-4 pt-5">
        {/* Title & favorite */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-4/5" />
            <Skeleton className="h-5 w-1/3" />
          </div>
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        </div>

        {/* Price */}
        <Skeleton className="mt-4 h-8 w-24" />

        {/* Badges */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-14 rounded-full" />
        </div>

        {/* Metadata lines */}
        <div className="mt-6 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>

        {/* Seller card */}
        <div className="mt-6 flex items-center gap-3 rounded-xl border p-4">
          <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}
