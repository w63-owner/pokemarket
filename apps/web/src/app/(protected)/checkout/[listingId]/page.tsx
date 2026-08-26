import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { SHIPPING_ORIGIN_COUNTRY } from "@deckdealr/shared";
import { createClient } from "@/lib/supabase/server";
import { fetchListingById } from "@/lib/api/listings.server";
import { getShippingCostsByDestination } from "@/lib/shipping";
import { CheckoutClient } from "./checkout-client";

export const metadata: Metadata = {
  title: "Paiement",
};

type Props = { params: Promise<{ listingId: string }> };

export default async function CheckoutPage({ params }: Props) {
  const { listingId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const listing = await fetchListingById(listingId);
  if (!listing) notFound();

  if (listing.seller_id === user.id) {
    redirect(`/listing/${listingId}`);
  }

  const isReservedForMe =
    (listing.status === "RESERVED" || listing.status === "LOCKED") &&
    listing.reserved_for === user.id;
  const isActive = listing.status === "ACTIVE";

  if (!isActive && !isReservedForMe) {
    redirect(`/listing/${listingId}?checkout=unavailable`);
  }

  const effectivePrice =
    (isReservedForMe
      ? (listing.reserved_price ?? listing.display_price)
      : listing.display_price) ?? 0;

  // Quote every destination for this parcel so the client can follow country
  // changes. `/api/checkout` uses the same matrix lookup with the buyer's
  // chosen country before creating the Stripe amount.
  const shippingByCountry = await getShippingCostsByDestination(
    SHIPPING_ORIGIN_COUNTRY,
    listing.delivery_weight_class ?? "S",
  );

  // Pre-fill the shipping form from the buyer's profile address (the one they
  // edit at /profile/profile). The profile is the canonical source: returning
  // buyers can update it once and have every future checkout pre-filled
  // automatically. RLS scopes this query to the buyer's own row; we ignore
  // failures and ship the form unfilled if there's nothing on file.
  const { data: profile } = await supabase
    .from("profiles")
    .select("address_line, city, postal_code, country_code")
    .eq("id", user.id)
    .maybeSingle();

  const defaultShipping =
    profile && (profile.address_line || profile.city || profile.postal_code)
      ? {
          addressLine: profile.address_line ?? "",
          city: profile.city ?? "",
          postcode: profile.postal_code ?? "",
          country: (profile.country_code ?? "FR") as string,
        }
      : null;

  return (
    // `key` forces a remount when the buyer navigates between checkouts for
    // different listings. Without it, React preserves the previous
    // `CheckoutClient` instance (same route segment) and its useState
    // initializers don't re-run, so an old buyer (or a stale `defaultShipping`
    // from the previous listing) would stick around in the form.
    <CheckoutClient
      key={`${user.id}:${listing.id}`}
      listing={{
        id: listing.id,
        title: listing.title,
        cover_image_url: listing.cover_image_url,
        display_price: listing.display_price ?? 0,
        condition: listing.condition,
        is_graded: listing.is_graded ?? false,
        grading_company: listing.grading_company,
        grade_note: listing.grade_note,
        card_series: listing.card_series,
        delivery_weight_class: listing.delivery_weight_class ?? "standard",
      }}
      effectivePrice={effectivePrice}
      shippingByCountry={shippingByCountry}
      defaultShipping={defaultShipping}
    />
  );
}
