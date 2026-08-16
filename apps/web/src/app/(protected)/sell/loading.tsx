import { Skeleton } from "@/components/ui/skeleton";

export default function SellLoading() {
  return (
    <div className="bg-background fixed inset-0 z-40 flex min-h-dvh flex-col">
      <div className="border-border border-b pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="space-y-1.5 text-center">
            <Skeleton className="mx-auto h-4 w-28" />
            <Skeleton className="mx-auto h-3 w-16" />
          </div>
          <div className="size-9" />
        </div>
        <div className="mx-auto grid max-w-3xl grid-cols-3 gap-2 px-4 pb-3">
          {[0, 1, 2].map((step) => (
            <div key={step} className="space-y-1.5">
              <Skeleton className="h-1 w-full rounded-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-6">
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="aspect-[3/4] w-full rounded-xl" />
            <Skeleton className="aspect-[3/4] w-full rounded-xl" />
          </div>
        </div>
      </div>

      <div className="border-border border-t px-4 py-3">
        <Skeleton className="mx-auto h-10 w-full max-w-lg rounded-lg" />
      </div>
    </div>
  );
}
