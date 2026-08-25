import { Suspense } from "react";
import { HomeFeed } from "@/components/feed/home-feed";
import { ListingCardSkeleton } from "@/components/feed/listing-card-skeleton";

function FeedSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <section className="bg-muted/30 flex-1 px-3 pt-4 pb-24 sm:px-6 lg:px-8 lg:pt-6">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-5 lg:hidden">
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            TheDeck<span className="text-brand">Dealr</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Les dernières cartes TCG en vente
          </p>
        </header>

        <Suspense fallback={<FeedSkeleton />}>
          <HomeFeed />
        </Suspense>
      </div>
    </section>
  );
}
