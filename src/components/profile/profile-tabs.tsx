"use client";

import Image from "next/image";
import Link from "next/link";
import {
  PackageOpen,
  Star,
  Info,
  MapPin,
  Calendar,
  Instagram,
  Facebook,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { StarRating } from "@/components/shared/star-rating";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPrice, formatRelativeDate } from "@/lib/utils";
import type { Profile } from "@/types";

const BLUR_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAFCAYAAABirU3bAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAMElEQVQIHWNgYPj/n4EBCBgZGf8zMDL+Z2Bg+M/IyPSfgYHhP8P//wwMDEz/GRgAH+oIAaHRcUUAAAAASUVORK5CYII=";

type ListingItem = {
  id: string;
  title: string;
  display_price: number;
  cover_image_url: string | null;
  condition: string | null;
};

type ReviewItem = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: {
    username: string;
    avatar_url: string | null;
  } | null;
};

interface ProfileTabsProps {
  profile: Profile;
  listings: ListingItem[];
  reviews: ReviewItem[];
}

export function ProfileTabs({ profile, listings, reviews }: ProfileTabsProps) {
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  return (
    <Tabs defaultValue="listings">
      <TabsList className="grid w-full grid-cols-3" variant="line">
        <TabsTrigger value="listings">
          <PackageOpen className="size-4" />
          Annonces
        </TabsTrigger>
        <TabsTrigger value="reviews">
          <Star className="size-4" />
          Avis
        </TabsTrigger>
        <TabsTrigger value="about">
          <Info className="size-4" />À propos
        </TabsTrigger>
      </TabsList>

      <TabsContent value="listings">
        <ListingsTab listings={listings} />
      </TabsContent>

      <TabsContent value="reviews">
        <ReviewsTab reviews={reviews} avgRating={avgRating} />
      </TabsContent>

      <TabsContent value="about">
        <AboutTab profile={profile} />
      </TabsContent>
    </Tabs>
  );
}

/* ─── Tab: Annonces ──────────────────────────────────────────────────────────── */

function ListingsTab({ listings }: { listings: ListingItem[] }) {
  if (listings.length === 0) {
    return (
      <EmptyState
        icon={<PackageOpen className="size-6" />}
        title="Aucune annonce active"
        description="Ce vendeur n'a pas encore publié d'annonce."
      />
    );
  }

  return (
    <div className="pt-4">
      <p className="text-muted-foreground mb-3 text-sm">
        {listings.length} article{listings.length > 1 ? "s" : ""}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {listings.map((listing) => (
          <Link
            key={listing.id}
            href={`/listing/${listing.id}`}
            className="group bg-card block overflow-hidden rounded-xl shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="bg-muted relative aspect-[63/88] overflow-hidden">
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
                  <span className="text-muted-foreground text-xs">
                    Pas d&apos;image
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-0.5 p-2.5">
              <p className="text-foreground line-clamp-2 text-sm leading-tight font-medium">
                {listing.title}
              </p>
              <p className="text-brand text-sm font-bold">
                {formatPrice(listing.display_price)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ─── Tab: Évaluations ───────────────────────────────────────────────────────── */

function ReviewsTab({
  reviews,
  avgRating,
}: {
  reviews: ReviewItem[];
  avgRating: number;
}) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={<Star className="size-6" />}
        title="Aucun avis pour le moment"
        description="Ce vendeur n'a pas encore reçu d'évaluation."
      />
    );
  }

  return (
    <div className="space-y-6 pt-4">
      <div className="flex items-center gap-4">
        <p className="text-4xl font-bold tabular-nums">
          {avgRating.toFixed(1)}
        </p>
        <div className="space-y-1">
          <StarRating rating={avgRating} size="lg" />
          <p className="text-muted-foreground text-sm">{reviews.length} avis</p>
        </div>
      </div>

      <div className="divide-border divide-y">
        {reviews.map((review) => (
          <div key={review.id} className="py-4 first:pt-0">
            <div className="flex items-center gap-3">
              <Avatar size="sm">
                <AvatarImage src={review.reviewer?.avatar_url || undefined} />
                <AvatarFallback>
                  {review.reviewer?.username?.charAt(0).toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">
                    {review.reviewer?.username ?? "Utilisateur supprimé"}
                  </p>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatRelativeDate(review.created_at)}
                  </span>
                </div>
                <StarRating rating={review.rating} size="sm" />
              </div>
            </div>
            {review.comment && (
              <p className="text-muted-foreground mt-2 pl-9 text-sm leading-relaxed">
                {review.comment}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Tab: À propos ──────────────────────────────────────────────────────────── */

function countryCodeToFlag(code: string): string {
  return code
    .toUpperCase()
    .split("")
    .map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65))
    .join("");
}

function AboutTab({ profile }: { profile: Profile }) {
  const memberSince =
    profile.created_at != null
      ? format(new Date(profile.created_at), "MMMM yyyy", { locale: fr })
      : "—";

  const hasSocials =
    profile.instagram_url || profile.facebook_url || profile.tiktok_url;

  return (
    <div className="space-y-6 pt-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar className="size-24">
          <AvatarImage src={profile.avatar_url || undefined} />
          <AvatarFallback className="text-3xl">
            {profile.username.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <h2 className="text-xl font-semibold">{profile.username}</h2>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-4 text-sm">
        {profile.country_code && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" />
            {countryCodeToFlag(profile.country_code)}{" "}
            {new Intl.DisplayNames(["fr"], { type: "region" }).of(
              profile.country_code,
            )}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="size-4" />
          Membre depuis {memberSince}
        </span>
      </div>

      {profile.bio && (
        <p className="text-foreground mx-auto max-w-md text-center text-sm leading-relaxed whitespace-pre-wrap">
          {profile.bio}
        </p>
      )}

      {hasSocials && (
        <div className="flex items-center justify-center gap-4">
          {profile.instagram_url && (
            <a
              href={profile.instagram_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Instagram"
            >
              <Instagram className="size-5" />
            </a>
          )}
          {profile.facebook_url && (
            <a
              href={profile.facebook_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Facebook"
            >
              <Facebook className="size-5" />
            </a>
          )}
          {profile.tiktok_url && (
            <a
              href={profile.tiktok_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="TikTok"
            >
              <TikTokIcon className="size-5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── TikTok SVG Icon ────────────────────────────────────────────────────────── */

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  );
}
