"use client";

import Link from "next/link";
import { BadgeCheck, ChevronRight, MapPin } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { StarRating } from "@/components/shared/star-rating";
import { cn } from "@/lib/utils";

interface SellerBlockProps {
  seller: {
    username: string;
    avatar_url: string | null;
    avg_rating: number | null;
    review_count: number;
    kyc_status?: string | null;
    city?: string | null;
    country_code?: string | null;
  };
  className?: string;
}

export function SellerBlock({ seller, className }: SellerBlockProps) {
  const initials = seller.username.slice(0, 2).toUpperCase();
  const location = [seller.city, seller.country_code]
    .filter((value): value is string => Boolean(value))
    .join(", ");

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
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="text-foreground truncate text-sm font-semibold">
            {seller.username}
          </p>
          {seller.kyc_status === "VERIFIED" && (
            <span
              className="text-primary inline-flex shrink-0 items-center gap-1 text-xs font-medium"
              aria-label="Identité vérifiée"
            >
              <BadgeCheck className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Vérifié</span>
            </span>
          )}
        </div>

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
        {location && (
          <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{location}</span>
          </p>
        )}
      </div>

      <ChevronRight
        className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}
