import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Avatar & name */}
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-20 w-20 rounded-full" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>

      {/* Menu rows */}
      <div className="mt-6 space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-3">
            <Skeleton className="h-5 w-5 shrink-0 rounded" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-4 shrink-0" />
          </div>
        ))}
      </div>

      {/* Theme toggle */}
      <div className="mt-4 flex items-center justify-between rounded-lg px-3 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-6 w-11 rounded-full" />
      </div>

      {/* Sign out */}
      <div className="mt-6 space-y-2">
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}
