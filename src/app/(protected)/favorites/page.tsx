"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import {
  Heart,
  Search,
  UserCheck,
  Sparkles,
  Users,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ListingCard } from "@/components/feed/listing-card";
import { ListingCardSkeleton } from "@/components/feed/listing-card-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useFavoriteListings } from "@/hooks/use-favorites";
import {
  useSavedSearches,
  useDeleteSavedSearch,
  useSavedSearchNewCounts,
  useMarkSavedSearchSeen,
} from "@/hooks/use-saved-searches";
import { Badge } from "@/components/ui/badge";
import {
  filtersToLabel,
  filtersToSearchString,
} from "@/hooks/use-feed-filters";
import type { FeedFilters } from "@/lib/query-keys";

const SKELETON_COUNT = 6;

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

function FavoriteListingsTab() {
  const { data: listings, isLoading, isError, error } = useFavoriteListings();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<Heart className="h-8 w-8" />}
        title="Impossible de charger vos favoris"
        description={error?.message ?? "Une erreur est survenue. Réessayez."}
      />
    );
  }

  if (!listings || listings.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles className="h-8 w-8" />}
        title="Pas encore de pépites en favori"
        description="Explorez le marché pour trouver les cartes de vos rêves et ajoutez-les à vos favoris."
        action={{ label: "Explorer le marché", href: "/" }}
      />
    );
  }

  return (
    <m.div
      className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
      variants={gridVariants}
      initial="hidden"
      animate="visible"
    >
      {listings.map((listing) => (
        <m.div key={listing.id} variants={itemVariants}>
          <ListingCard listing={listing} />
        </m.div>
      ))}
    </m.div>
  );
}

function SavedSearchSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border p-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function SavedSearchesTab() {
  const router = useRouter();
  const { data: searches, isLoading, isError, error } = useSavedSearches();
  const { mutate: deleteSearch } = useDeleteSavedSearch();
  const { countsMap } = useSavedSearchNewCounts();
  const { mutate: markSeen } = useMarkSavedSearchSeen();

  if (isLoading) return <SavedSearchSkeleton />;

  if (isError) {
    return (
      <EmptyState
        icon={<Search className="h-8 w-8" />}
        title="Impossible de charger vos recherches"
        description={error?.message ?? "Une erreur est survenue. Réessayez."}
      />
    );
  }

  if (!searches || searches.length === 0) {
    return (
      <EmptyState
        icon={<Search className="h-8 w-8" />}
        title="Aucune recherche sauvegardée"
        description="Lancez une recherche avec des filtres puis appuyez sur « Sauvegarder » pour la retrouver ici."
        action={{ label: "Explorer le marché", href: "/" }}
      />
    );
  }

  function handleRun(id: string, params: FeedFilters) {
    markSeen(id);
    const qs = filtersToSearchString(params);
    router.push(qs ? `/?${qs}` : "/");
  }

  return (
    <m.div
      className="space-y-3"
      variants={gridVariants}
      initial="hidden"
      animate="visible"
    >
      {searches.map((search) => {
        const params = (search.search_params ?? {}) as FeedFilters;
        const label = filtersToLabel(params);
        const relative = search.created_at
          ? formatRelativeDate(new Date(search.created_at))
          : "—";
        const newCount = countsMap.get(search.id) ?? 0;

        return (
          <m.div key={search.id} variants={itemVariants}>
            <div className="group hover:bg-muted/50 flex items-center gap-3 rounded-xl border p-4 transition-colors">
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
                onClick={() => handleRun(search.id, params)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-foreground truncate text-sm font-medium">
                    {search.name}
                  </span>
                  {newCount > 0 && (
                    <Badge className="bg-brand hover:bg-brand/90 shrink-0 text-[10px] text-white">
                      {newCount} nouvelle{newCount > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
                <span className="text-muted-foreground line-clamp-1 text-xs">
                  {label}
                </span>
                <span className="text-muted-foreground/60 text-[11px]">
                  {relative}
                </span>
              </button>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRun(search.id, params)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="sr-only">Lancer la recherche</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => deleteSearch(search.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Supprimer</span>
                </Button>
              </div>
            </div>
          </m.div>
        );
      })}
    </m.div>
  );
}

function formatRelativeDate(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days}j`;
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

function FavoriteSellersTab() {
  return (
    <EmptyState
      icon={<Users className="h-8 w-8" />}
      title="Bientôt disponible"
      description="Vos vendeurs favoris apparaîtront ici. Suivez-les pour ne rien manquer."
    />
  );
}

export default function FavoritesPage() {
  const [tab, setTab] = useState("listings");

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-24">
      <h1 className="font-display text-foreground mb-5 text-2xl font-bold">
        Favoris
      </h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList
          className="mx-auto mb-6 grid w-full max-w-md grid-cols-3"
          variant="line"
        >
          <TabsTrigger value="listings">
            <Heart className="size-4" />
            Annonces
          </TabsTrigger>
          <TabsTrigger value="searches">
            <Search className="size-4" />
            Recherches
          </TabsTrigger>
          <TabsTrigger value="sellers">
            <UserCheck className="size-4" />
            Vendeurs
          </TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          <m.div
            key={tab}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "listings" && <FavoriteListingsTab />}
            {tab === "searches" && <SavedSearchesTab />}
            {tab === "sellers" && <FavoriteSellersTab />}
          </m.div>
        </AnimatePresence>
      </Tabs>
    </div>
  );
}
