import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fetchListingById } from "@/lib/api/listings.server";
import { getSellerReputation } from "@/lib/api/reviews";
import { getAppUrl } from "@/lib/env";
import { getShippingCost } from "@/lib/shipping";
import { formatRelativeDate } from "@deckdealr/shared";

export const dynamic = "force-dynamic";
import { ImageCarousel } from "@/components/listing/image-carousel";
import { SellerBlock } from "@/components/listing/seller-block";
import { ListingActions } from "@/components/listing/listing-actions";
import { PriceDisplay } from "@/components/shared/price-display";
import { ConditionBadge } from "@/components/shared/condition-badge";
import { FavoriteButton } from "@/components/shared/favorite-button";
import { PriceHistoryChart } from "@/components/listing/price-history-chart";
import { ReportDialog } from "@/components/listing/report-dialog";
import { MobileHeader } from "@/components/layout/mobile-header";
import { ListingShareButton } from "@/components/listing/listing-share-button";
import { CheckoutReassurance } from "@/components/listing/checkout-reassurance";

type Props = { params: Promise<{ id: string }> };

const BASE_URL = getAppUrl();

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
    description: `${listing.title} en vente sur TheDeckDealr – ${(listing.display_price ?? 0).toFixed(2)} €`,
    alternates: {
      canonical: `${BASE_URL}/listing/${listing.id}`,
    },
    openGraph: {
      title: `${title} | TheDeckDealr`,
      description: `${listing.title} en vente sur TheDeckDealr`,
      url: `${BASE_URL}/listing/${listing.id}`,
      images: listing.cover_image_url ? [{ url: listing.cover_image_url }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | TheDeckDealr`,
      description: `${listing.title} en vente sur TheDeckDealr`,
      images: listing.cover_image_url ? [listing.cover_image_url] : [],
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

  const [reputation, shippingCost] = await Promise.all([
    getSellerReputation(listing.seller_id),
    getShippingCost(
      listing.profiles.country_code ?? "FR",
      "FR",
      listing.delivery_weight_class ?? "S",
    ),
  ]);
  const avgRating = reputation.reviewCount > 0 ? reputation.avgRating : null;
  const reviewCount = reputation.reviewCount;

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

  const meta = listing.card_metadata;
  const series = listing.card_series ?? meta?.set_name;
  const block = listing.card_block ?? meta?.series_name;
  const rarity = listing.card_rarity ?? meta?.rarity;
  const illustrator = listing.card_illustrator ?? meta?.illustrator;
  const hasCardDetails =
    series ||
    block ||
    listing.card_number ||
    listing.card_language ||
    rarity ||
    illustrator;
  const listingStatus = (listing.status ?? "ACTIVE") as
    | "ACTIVE"
    | "LOCKED"
    | "RESERVED"
    | "SOLD"
    | "DRAFT";
  const isReservedForViewer =
    !!user &&
    (listing.status === "RESERVED" || listing.status === "LOCKED") &&
    listing.reserved_for === user.id;

  return (
    <div className="pb-28 lg:pb-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-12 lg:px-6 lg:pt-8">
        <div className="relative lg:col-span-7">
          <MobileHeader
            title={listing.title}
            fallbackUrl="/"
            transparent
            className="absolute inset-x-0 top-0"
          />
          <div className="lg:sticky lg:top-24">
            <ImageCarousel
              images={images}
              className="rounded-none sm:rounded-2xl"
            />
          </div>
        </div>

        <aside className="px-4 pt-5 lg:col-span-5 lg:px-0 lg:pt-0">
          <div className="lg:sticky lg:top-24">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <h1 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">
                  {listing.title}
                </h1>
                <PriceDisplay
                  price={listing.display_price ?? 0}
                  size="lg"
                  className="block text-3xl"
                />
                {listing.created_at && (
                  <p className="text-muted-foreground text-sm">
                    Mise en ligne {formatRelativeDate(listing.created_at)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <ListingShareButton
                  listingId={listing.id}
                  title={listing.title}
                />
                {!isOwner && (
                  <FavoriteButton
                    listingId={listing.id}
                    size="md"
                    className="bg-muted/80 hover:bg-muted"
                  />
                )}
              </div>
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

            <div className="bg-muted/40 mt-5 rounded-xl border p-4">
              <p className="font-medium">Achetez en toute confiance</p>
              <ul className="text-muted-foreground mt-2 space-y-1.5 text-sm">
                <li>Livraison estimée dès {shippingCost.toFixed(2)} €</li>
                <li>Protection acheteur incluse dans le prix affiché</li>
                <li>Paiement sécurisé, vendeur payé après réception</li>
              </ul>
              <CheckoutReassurance className="mt-3 justify-start" />
            </div>

            <SellerBlock
              seller={{
                username: listing.profiles.username,
                avatar_url: listing.profiles.avatar_url,
                avg_rating: avgRating,
                review_count: reviewCount,
                kyc_status: listing.profiles.kyc_status,
                city: listing.profiles.city,
                country_code: listing.profiles.country_code,
              }}
              className="mt-5"
            />

            <ListingActions
              listingId={listing.id}
              mode={isOwner ? "seller" : "buyer"}
              currentPrice={listing.display_price ?? 0}
              listingStatus={listingStatus}
              isReservedForViewer={isReservedForViewer}
              reservedPrice={listing.reserved_price ?? null}
              className="lg:mx-0 lg:max-w-none"
            />
          </div>
        </aside>
      </div>

      <div className="mx-auto mt-8 max-w-7xl space-y-6 px-4 lg:px-6">
        {listing.description && (
          <section className="rounded-xl border p-5">
            <h2 className="font-heading text-lg font-semibold">
              Description du vendeur
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-6 whitespace-pre-wrap">
              {listing.description}
            </p>
          </section>
        )}

        {hasCardDetails && (
          <section className="rounded-xl border p-5">
            <h2 className="font-heading text-lg font-semibold">
              Détails de la carte
            </h2>
            <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {series && (
                <span>
                  Série : <strong className="text-foreground">{series}</strong>
                </span>
              )}
              {block && (
                <span>
                  Bloc : <strong className="text-foreground">{block}</strong>
                </span>
              )}
              {listing.card_number && (
                <span>
                  N° :{" "}
                  <strong className="text-foreground">
                    {listing.card_number}
                  </strong>
                </span>
              )}
              {illustrator && (
                <span>
                  Illustrateur :{" "}
                  <strong className="text-foreground">{illustrator}</strong>
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
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
          </section>
        )}

        {listing.card_ref_id && (
          <PriceHistoryChart
            cardKey={listing.card_ref_id}
            variant={
              listing.card_variant === "holo" ||
              listing.card_variant === "normal"
                ? listing.card_variant
                : "normal"
            }
          />
        )}

        {!isOwner && (
          <div className="flex justify-end">
            <ReportDialog listingId={listing.id} />
          </div>
        )}
      </div>
    </div>
  );
}
