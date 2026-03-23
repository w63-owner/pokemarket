"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Heart, Search, UserCheck, Sparkles, Clock, Users } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ListingCard } from "@/components/feed/listing-card";
import { ListingCardSkeleton } from "@/components/feed/listing-card-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useFavoriteListings } from "@/hooks/use-favorites";

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
    <motion.div
      className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
      variants={gridVariants}
      initial="hidden"
      animate="visible"
    >
      {listings.map((listing) => (
        <motion.div key={listing.id} variants={itemVariants}>
          <ListingCard listing={listing} />
        </motion.div>
      ))}
    </motion.div>
  );
}

function SavedSearchesTab() {
  return (
    <EmptyState
      icon={<Clock className="h-8 w-8" />}
      title="Bientôt disponible"
      description="Vos recherches sauvegardées apparaîtront ici. Vous pourrez les relancer en un tap."
    />
  );
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
  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-24">
      <h1 className="font-display text-foreground mb-5 text-2xl font-bold">
        Favoris
      </h1>

      <Tabs defaultValue="listings">
        <TabsList className="mx-auto mb-6 w-full max-w-md">
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
          <TabsContent value="listings">
            <motion.div
              key="listings"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
            >
              <FavoriteListingsTab />
            </motion.div>
          </TabsContent>

          <TabsContent value="searches">
            <motion.div
              key="searches"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
            >
              <SavedSearchesTab />
            </motion.div>
          </TabsContent>

          <TabsContent value="sellers">
            <motion.div
              key="sellers"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
            >
              <FavoriteSellersTab />
            </motion.div>
          </TabsContent>
        </AnimatePresence>
      </Tabs>
    </div>
  );
}
