import { Skeleton } from "@/components/ui/skeleton";

export default function CheckoutLoading() {
  return (
    <>
      {/* MobileHeader placeholder */}
      <div className="bg-background/80 sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 backdrop-blur-md">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-5 w-20" />
        <div className="w-5" />
      </div>

      <div className="mx-auto max-w-lg px-4 pt-4 pb-32">
        <div className="space-y-6">
          {/* Intro */}
          <div className="space-y-2 text-center">
            <Skeleton className="mx-auto h-6 w-48" />
            <Skeleton className="mx-auto h-4 w-32" />
          </div>

          {/* Order summary card */}
          <div className="rounded-2xl border p-4 shadow-sm">
            <div className="flex gap-4">
              <Skeleton className="h-24 w-20 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </div>
            <div className="mt-4 space-y-2 border-t pt-4">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-12" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          </div>

          {/* Shipping card */}
          <div className="rounded-2xl border p-4 shadow-sm">
            <Skeleton className="mb-4 h-5 w-36" />
            <div className="space-y-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
