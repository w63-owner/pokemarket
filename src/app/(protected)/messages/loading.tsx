import { Skeleton } from "@/components/ui/skeleton";

function ConversationRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}

export default function MessagesLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Header */}
      <header className="bg-background/80 sticky top-0 z-30 border-b px-4 pt-6 pb-3 backdrop-blur-md">
        <Skeleton className="h-8 w-28" />
      </header>

      {/* Conversation list */}
      <div className="divide-y">
        {Array.from({ length: 8 }).map((_, i) => (
          <ConversationRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
