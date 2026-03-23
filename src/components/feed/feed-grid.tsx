"use client";

import { useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { motion, useReducedMotion } from "framer-motion";
import { PackageOpen, RefreshCw } from "lucide-react";
import { useInfiniteFeed } from "@/hooks/use-infinite-feed";
import { ListingCard } from "@/components/feed/listing-card";
import { ListingCardSkeleton } from "@/components/feed/listing-card-skeleton";
import { Button } from "@/components/ui/button";
import type { FeedFilters } from "@/lib/query-keys";

const SKELETON_COUNT = 10;

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
};

interface FeedGridProps {
  filters?: FeedFilters;
}

export function FeedGrid({ filters = {} }: FeedGridProps) {
  const prefersReducedMotion = useReducedMotion();

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteFeed(filters);

  const { ref: sentinelRef, inView } = useInView({
    threshold: 0,
    rootMargin: "400px",
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allItems = data?.pages.flatMap((page) => page.items) ?? [];

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="bg-destructive/10 rounded-full p-4">
          <RefreshCw className="text-destructive h-8 w-8" />
        </div>
        <div className="space-y-1">
          <p className="text-foreground font-medium">
            Impossible de charger les annonces
          </p>
          <p className="text-muted-foreground text-sm">
            {error?.message ?? "Une erreur inattendue est survenue."}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Réessayer
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="bg-muted rounded-full p-4">
          <PackageOpen className="text-muted-foreground h-8 w-8" />
        </div>
        <div className="space-y-1">
          <p className="text-foreground font-medium">Aucune annonce trouvée</p>
          <p className="text-muted-foreground text-sm">
            Le marché est vide pour le moment. Revenez bientôt !
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <motion.div
        className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        variants={prefersReducedMotion ? undefined : containerVariants}
        initial={prefersReducedMotion ? false : "hidden"}
        animate="visible"
      >
        {allItems.map((item, index) => (
          <motion.div
            key={item.id}
            variants={prefersReducedMotion ? undefined : itemVariants}
          >
            <ListingCard listing={item} priority={index < 2} />
          </motion.div>
        ))}

        {isFetchingNextPage &&
          Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <ListingCardSkeleton key={`next-skeleton-${i}`} />
          ))}
      </motion.div>

      {hasNextPage && (
        <div ref={sentinelRef} className="h-10" aria-hidden="true" />
      )}
    </>
  );
}
