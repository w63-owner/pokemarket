import { Suspense } from "react";
import { HomeFeed } from "@/components/feed/home-feed";
import { ListingCardSkeleton } from "@/components/feed/listing-card-skeleton";

function FeedSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="flex-1 px-3 pt-4 pb-24 sm:px-4 md:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Poke<span className="text-brand">Market</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Les dernières cartes Pokémon en vente
          </p>
        </header>

        <Suspense fallback={<FeedSkeleton />}>
          <HomeFeed />
        </Suspense>
      </div>
    </main>
  );
}
