import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fetchListingById } from "@/lib/api/listings.server";
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
    listing.status === "RESERVED" && listing.reserved_for === user.id;
  const isActive = listing.status === "ACTIVE";

  if (!isActive && !isReservedForMe) {
    redirect(`/listing/${listingId}?checkout=unavailable`);
  }

  const effectivePrice = isReservedForMe
    ? (listing.reserved_price ?? listing.display_price)
    : listing.display_price;

  const MOCK_SHIPPING_COST = 4.99;

  return (
    <CheckoutClient
      listing={{
        id: listing.id,
        title: listing.title,
        cover_image_url: listing.cover_image_url,
        display_price: listing.display_price,
        condition: listing.condition,
        is_graded: listing.is_graded,
        grading_company: listing.grading_company,
        grade_note: listing.grade_note,
        card_series: listing.card_series,
        delivery_weight_class: listing.delivery_weight_class,
      }}
      effectivePrice={effectivePrice}
      shippingCost={MOCK_SHIPPING_COST}
    />
  );
}
