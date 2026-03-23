"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ConditionBadge } from "@/components/shared/condition-badge";
import { PriceDisplay } from "@/components/shared/price-display";
import { FavoriteButton } from "@/components/shared/favorite-button";
import type { FeedItem } from "@/types";

const BLUR_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAFCAYAAABirU3bAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAMElEQVQIHWNgYPj/n4EBCBgZGf8zMDL+Z2Bg+M/IyPSfgYHhP8P//wwMDEz/GRgAH+oIAaHRcUUAAAAASUVORK5CYII=";

interface ListingCardProps {
  listing: FeedItem;
  showFavorite?: boolean;
}

export function ListingCard({
  listing,
  showFavorite = true,
}: ListingCardProps) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <Link href={`/listing/${listing.id}`} className="group block">
        <div className="bg-card overflow-hidden rounded-xl shadow-sm transition-shadow hover:shadow-md">
          <div className="bg-muted relative aspect-[4/5] overflow-hidden">
            {listing.cover_image_url ? (
              <Image
                src={listing.cover_image_url}
                alt={listing.title}
                fill
                sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                placeholder="blur"
                blurDataURL={BLUR_PLACEHOLDER}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="text-muted-foreground text-sm">
                  Pas d&apos;image
                </span>
              </div>
            )}

            {showFavorite && (
              <FavoriteButton
                listingId={listing.id}
                className="absolute right-2 bottom-2 z-10"
              />
            )}
          </div>

          <div className="space-y-1 p-3">
            <h3 className="text-foreground truncate text-sm font-medium">
              {listing.title}
            </h3>

            {listing.card_series && (
              <p className="text-muted-foreground truncate text-xs">
                {listing.card_series}
              </p>
            )}

            <div className="flex items-center gap-2">
              {listing.condition && !listing.is_graded && (
                <ConditionBadge condition={listing.condition} />
              )}
              {listing.is_graded && listing.grade_note !== null && (
                <span className="bg-brand-accent/15 text-brand-accent inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold">
                  {listing.grade_note}/10
                </span>
              )}
            </div>

            <PriceDisplay price={listing.display_price} />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
