import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fetchListingById } from "@/lib/api/listings.server";
import { ImageCarousel } from "@/components/listing/image-carousel";
import { SellerBlock } from "@/components/listing/seller-block";
import { ListingActions } from "@/components/listing/listing-actions";
import { PriceDisplay } from "@/components/shared/price-display";
import { ConditionBadge } from "@/components/shared/condition-badge";
import { FavoriteButton } from "@/components/shared/favorite-button";
import { PriceHistoryChart } from "@/components/listing/price-history-chart";
import { MobileHeader } from "@/components/layout/mobile-header";

type Props = { params: Promise<{ id: string }> };

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pokemarket.fr";

const CONDITION_TO_SCHEMA: Record<string, string> = {
  MINT: "https://schema.org/NewCondition",
  NEAR_MINT: "https://schema.org/NewCondition",
  EXCELLENT: "https://schema.org/UsedCondition",
  GOOD: "https://schema.org/UsedCondition",
  LIGHT_PLAYED: "https://schema.org/UsedCondition",
  PLAYED: "https://schema.org/UsedCondition",
  POOR: "https://schema.org/DamagedCondition",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const listing = await fetchListingById(id);

  if (!listing) {
    return { title: "Annonce introuvable" };
  }

  const titleParts = [listing.title];
  if (listing.card_series) titleParts.push(listing.card_series);
  if (listing.card_number) titleParts.push(`N°${listing.card_number}`);
  const title = titleParts.join(" - ");

  return {
    title,
    description: `${listing.title} en vente sur PokeMarket – ${(listing.display_price ?? 0).toFixed(2)} €`,
    openGraph: {
      title: `${title} | PokeMarket`,
      description: `${listing.title} en vente sur PokeMarket`,
      images: listing.cover_image_url ? [{ url: listing.cover_image_url }] : [],
    },
  };
}

export default async function ListingPage({ params }: Props) {
  const { id } = await params;
  const listing = await fetchListingById(id);

  if (!listing) notFound();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isOwner = user?.id === listing.seller_id;

  const { data: reviews } = await supabase
    .from("reviews")
    .select("rating")
    .eq("reviewee_id", listing.seller_id);

  const reviewCount = reviews?.length ?? 0;
  const avgRating =
    reviewCount > 0
      ? reviews!.reduce((sum, r) => sum + r.rating, 0) / reviewCount
      : null;

  const images = [
    ...(listing.cover_image_url
      ? [{ url: listing.cover_image_url, alt: `${listing.title} – Recto` }]
      : []),
    ...(listing.back_image_url
      ? [{ url: listing.back_image_url, alt: `${listing.title} – Verso` }]
      : []),
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    ...(listing.cover_image_url && { image: listing.cover_image_url }),
    ...(listing.card_series && {
      description: `${listing.title} – ${listing.card_series}`,
    }),
    url: `${BASE_URL}/listing/${listing.id}`,
    offers: {
      "@type": "Offer",
      price: (listing.display_price ?? 0).toFixed(2),
      priceCurrency: "EUR",
      availability:
        listing.status === "ACTIVE"
          ? "https://schema.org/InStock"
          : "https://schema.org/SoldOut",
      ...(listing.condition && {
        itemCondition:
          CONDITION_TO_SCHEMA[listing.condition] ??
          "https://schema.org/UsedCondition",
      }),
      seller: {
        "@type": "Person",
        name: listing.profiles.username,
        url: `${BASE_URL}/u/${listing.profiles.username}`,
      },
    },
  };

  return (
    <div className="pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="relative">
        <MobileHeader
          title={listing.title}
          fallbackUrl="/"
          transparent
          className="absolute inset-x-0 top-0"
        />
        <ImageCarousel
          images={images}
          className="rounded-none sm:mx-auto sm:mt-4 sm:max-w-2xl sm:rounded-2xl"
        />
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-5">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-heading text-2xl font-bold tracking-tight">
              {listing.title}
            </h1>
            {!isOwner && (
              <FavoriteButton
                listingId={listing.id}
                size="md"
                className="bg-muted/80 text-foreground hover:bg-muted shrink-0"
              />
            )}
          </div>
          <PriceDisplay price={listing.display_price ?? 0} size="lg" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {listing.condition && (
            <ConditionBadge condition={listing.condition} />
          )}
          {listing.is_graded && listing.grading_company && (
            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
              {listing.grading_company}
              {listing.grade_note != null ? ` ${listing.grade_note}` : ""}
            </span>
          )}
        </div>

        {(() => {
          const meta = listing.card_metadata;
          const series = listing.card_series ?? meta?.set_name;
          const block = listing.card_block ?? meta?.series_name;
          const rarity = listing.card_rarity ?? meta?.rarity;
          const illustrator = listing.card_illustrator ?? meta?.illustrator;
          const hasInfo =
            series ||
            block ||
            listing.card_number ||
            listing.card_language ||
            rarity ||
            illustrator;

          if (!hasInfo) return null;

          return (
            <div className="mt-4 space-y-1.5">
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {series && (
                  <span>
                    Série :{" "}
                    <span className="text-foreground font-medium">
                      {series}
                    </span>
                  </span>
                )}
                {block && (
                  <span>
                    Bloc :{" "}
                    <span className="text-foreground font-medium">{block}</span>
                  </span>
                )}
                {listing.card_number && (
                  <span>
                    N° :{" "}
                    <span className="text-foreground font-medium">
                      {listing.card_number}
                    </span>
                  </span>
                )}
              </div>
              {illustrator && (
                <div className="text-muted-foreground text-sm">
                  Illustrateur :{" "}
                  <span className="text-foreground font-medium">
                    {illustrator}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {listing.card_language && (
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    {listing.card_language.toUpperCase()}
                  </span>
                )}
                {rarity && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                    {rarity}
                  </span>
                )}
              </div>
            </div>
          );
        })()}

        {listing.card_ref_id && (
          <PriceHistoryChart
            cardKey={listing.card_ref_id}
            condition={listing.condition}
            language={listing.card_language}
            isGraded={listing.is_graded ?? false}
          />
        )}

        <SellerBlock
          seller={{
            username: listing.profiles.username,
            avatar_url: listing.profiles.avatar_url,
            avg_rating: avgRating,
            review_count: reviewCount,
          }}
          className="mt-6"
        />
      </div>

      <ListingActions
        listingId={listing.id}
        mode={isOwner ? "seller" : "buyer"}
        currentPrice={listing.display_price ?? 0}
      />
    </div>
  );
}
