import { Skeleton } from "@/components/ui/skeleton";

export default function WalletLoading() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-7 w-32" />
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-4">
          <Skeleton className="mb-2 h-3 w-20" />
          <Skeleton className="h-7 w-24" />
        </div>
        <div className="rounded-xl border p-4">
          <Skeleton className="mb-2 h-3 w-16" />
          <Skeleton className="h-7 w-20" />
        </div>
      </div>

      {/* Payout button */}
      <Skeleton className="mt-4 h-11 w-full rounded-xl" />

      {/* Transaction history */}
      <div className="mt-6 space-y-1">
        <Skeleton className="mb-3 h-5 w-28" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>

      {/* Footer link */}
      <div className="mt-4 border-t pt-4">
        <Skeleton className="mx-auto h-4 w-40" />
      </div>
    </div>
  );
}
