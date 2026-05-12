import { Skeleton } from "@/components/ui/skeleton";

export default function SellLoading() {
  return (
    <>
      {/* MobileHeader placeholder */}
      <div className="bg-background/80 sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 backdrop-blur-md">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-5 w-24" />
        <div className="w-5" />
      </div>

      <div className="mx-auto w-full max-w-lg px-4 pt-6 pb-24">
        {/* Image upload area */}
        <div className="mb-6">
          <Skeleton className="mb-3 h-4 w-16" />
          <div className="flex gap-3">
            <Skeleton className="h-24 w-24 shrink-0 rounded-xl" />
            <Skeleton className="h-24 w-24 shrink-0 rounded-xl" />
            <Skeleton className="h-24 w-24 shrink-0 rounded-xl" />
          </div>
        </div>

        {/* Divider */}
        <div className="mb-6 flex items-center gap-2">
          <Skeleton className="h-px flex-1" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-px flex-1" />
        </div>

        {/* Form fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </div>

        {/* Submit button */}
        <Skeleton className="mt-8 h-12 w-full rounded-xl" />
      </div>
    </>
  );
}
