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
  variant?: "surface" | "overlay";
}

export function FavoriteButton({
  listingId,
  className,
  size = "sm",
  variant = "surface",
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
        "focus-visible:ring-ring/50 flex items-center justify-center rounded-full border transition-colors outline-none focus-visible:ring-3",
        variant === "overlay"
          ? "border-white/20 bg-black/55 text-white shadow-sm backdrop-blur-sm hover:bg-black/70"
          : "border-border bg-background text-foreground hover:bg-muted shadow-sm",
        size === "sm" ? "size-9" : "size-11",
        className,
      )}
      aria-label={active ? "Retirer des favoris" : "Ajouter aux favoris"}
      aria-pressed={active}
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
                : "fill-transparent text-current",
            )}
            aria-hidden="true"
          />
        </m.div>
      </AnimatePresence>
    </button>
  );
}
