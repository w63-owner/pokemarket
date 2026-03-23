"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { StarRating } from "@/components/shared/star-rating";
import { cn } from "@/lib/utils";

interface SellerBlockProps {
  seller: {
    username: string;
    avatar_url: string | null;
    avg_rating: number | null;
    review_count: number;
  };
  className?: string;
}

export function SellerBlock({ seller, className }: SellerBlockProps) {
  const initials = seller.username.slice(0, 2).toUpperCase();

  return (
    <Link
      href={`/u/${seller.username}`}
      className={cn(
        "group border-border bg-card flex items-center gap-3 rounded-xl border p-3 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <Avatar size="lg">
        {seller.avatar_url ? (
          <AvatarImage src={seller.avatar_url} alt={seller.username} />
        ) : null}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-sm font-semibold">
          {seller.username}
        </p>

        <div className="mt-0.5 flex items-center gap-1.5">
          {seller.avg_rating !== null ? (
            <>
              <StarRating rating={seller.avg_rating} size="sm" />
              <span className="text-muted-foreground text-xs">
                {seller.avg_rating.toFixed(1)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground text-xs">
              Nouveau vendeur
            </span>
          )}
          {seller.review_count > 0 && (
            <span className="text-muted-foreground text-xs">
              ({seller.review_count} avis)
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
