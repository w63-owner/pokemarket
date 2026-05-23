"use client";

import { Star } from "lucide-react";
import { StarRating } from "@/components/shared/star-rating";
import { cn } from "@/lib/utils";

interface SellerReputationBadgeProps {
  avgRating: number;
  reviewCount: number;
  className?: string;
}

export function SellerReputationBadge({
  avgRating,
  reviewCount,
  className,
}: SellerReputationBadgeProps) {
  if (reviewCount === 0) {
    return (
      <div
        className={cn(
          "bg-muted/50 flex items-center gap-2 rounded-lg px-3 py-2",
          className,
        )}
      >
        <Star className="text-muted-foreground size-4" />
        <span className="text-muted-foreground text-sm">
          Nouveau vendeur — pas encore d&apos;avis
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-muted/50 flex items-center gap-3 rounded-lg px-3 py-2",
        className,
      )}
    >
      <StarRating rating={avgRating} size="sm" />
      <span className="text-foreground text-sm font-semibold tabular-nums">
        {avgRating.toFixed(1)}
      </span>
      <span className="text-muted-foreground text-sm">
        ({reviewCount} avis)
      </span>
    </div>
  );
}
