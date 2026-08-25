import { Skeleton } from "@/components/ui/skeleton";
import { MobileHeader } from "@/components/layout/mobile-header";

export default function ListingLoading() {
  return (
    <div className="pb-28 lg:pb-10">
      <MobileHeader
        title="Chargement de l’annonce"
        fallbackUrl="/"
        transparent
        className="absolute inset-x-0 top-0"
      />

      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-12 lg:px-6 lg:pt-8">
        <div className="lg:col-span-7">
          <Skeleton className="aspect-[63/88] w-full sm:rounded-2xl lg:sticky lg:top-24" />
        </div>

        <div className="space-y-6 px-4 pt-5 lg:col-span-5 lg:px-0 lg:pt-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-3">
              <Skeleton className="h-7 w-4/5" />
              <Skeleton className="h-10 w-1/3" />
              <Skeleton className="h-4 w-2/5" />
            </div>
            <Skeleton className="size-10 shrink-0 rounded-full" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>

          <div className="flex items-center gap-3 rounded-xl border p-4">
            <Skeleton className="size-12 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>

          <div className="hidden space-y-3 rounded-xl border p-4 lg:block">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      </div>

      <div className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 flex-[2]" />
      </div>

      <div className="mx-auto mt-8 hidden max-w-7xl px-6 lg:block">
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    </div>
  );
}
