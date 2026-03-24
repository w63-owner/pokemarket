"use client";

import { Heart } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useFavorites } from "@/hooks/use-favorites";
import { spring } from "@/lib/motion";

interface FavoriteButtonProps {
  listingId: string;
  className?: string;
  size?: "sm" | "md";
}

export function FavoriteButton({
  listingId,
  className,
  size = "sm",
}: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const active = isFavorite(listingId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(listingId);
      }}
      className={cn(
        "flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm transition-colors hover:bg-black/50",
        size === "sm" ? "h-8 w-8" : "h-10 w-10",
        className,
      )}
      aria-label={active ? "Retirer des favoris" : "Ajouter aux favoris"}
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={active ? "filled" : "empty"}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={spring.bouncy}
        >
          <Heart
            className={cn(
              size === "sm" ? "h-4 w-4" : "h-5 w-5",
              active
                ? "fill-primary text-primary"
                : "fill-transparent text-white",
            )}
          />
        </m.div>
      </AnimatePresence>
    </button>
  );
}
