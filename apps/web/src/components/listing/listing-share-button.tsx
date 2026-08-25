"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ListingShareButtonProps {
  listingId: string;
  title?: string;
  showLabel?: boolean;
  className?: string;
}

export function ListingShareButton({
  listingId,
  title,
  showLabel = false,
  className,
}: ListingShareButtonProps) {
  async function handleShare() {
    const url = `${window.location.origin}/listing/${listingId}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: title ?? document.title,
          text: "Découvrez cette annonce sur DeckDealr",
          url,
        });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien de l’annonce copié");
    } catch {
      toast.error("Impossible de copier le lien");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={showLabel ? "lg" : "icon-lg"}
      className={cn("shrink-0", className)}
      onClick={() => void handleShare()}
      aria-label={showLabel ? undefined : "Partager l’annonce"}
    >
      <Share2 className="size-4" aria-hidden="true" />
      {showLabel && "Partager"}
    </Button>
  );
}
