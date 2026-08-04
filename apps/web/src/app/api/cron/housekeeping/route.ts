import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// An accepted offer reserves the listing. If the buyer doesn't check out
// within ACCEPTED_OFFER_TTL_HOURS we release the listing back to ACTIVE so
// other buyers can purchase it.
const ACCEPTED_OFFER_TTL_HOURS = 48;

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    // ── 1. Expire PENDING offers past their expires_at ────────────────────
    const { data: expiredPending, error: pendingFetchError } = await admin
      .from("offers")
      .select("id")
      .eq("status", "PENDING")
      .lt("expires_at", new Date().toISOString());

    if (pendingFetchError) throw pendingFetchError;

    let expiredPendingCount = 0;
    if (expiredPending && expiredPending.length > 0) {
      const offerIds = expiredPending.map((o) => o.id);
      const { error: updateError } = await admin
        .from("offers")
        .update({ status: "EXPIRED" })
        .in("id", offerIds)
        .eq("status", "PENDING");
      if (updateError) throw updateError;
      expiredPendingCount = expiredPending.length;
    }

    // ── 2. Expire stale ACCEPTED offers and free their reserved listings ──
    // CRITICAL: free (or confirm the listing has moved on) BEFORE expiring the
    // offer. Expiring first permanently orphans RESERVED listings whenever the
    // free step fails or is skipped — later cron runs only select ACCEPTED
    // offers, so a stuck reservation is never retried.
    const reservationCutoff = new Date(
      Date.now() - ACCEPTED_OFFER_TTL_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const { data: staleAccepted, error: acceptedFetchError } = await admin
      .from("offers")
      .select("id, listing_id, buyer_id")
      .eq("status", "ACCEPTED")
      .lt("created_at", reservationCutoff);

    if (acceptedFetchError) throw acceptedFetchError;

    let expiredAcceptedCount = 0;
    let listingsFreed = 0;

    for (const offer of staleAccepted ?? []) {
      const { data: freed, error: freeError } = await admin
        .from("listings")
        .update({
          status: "ACTIVE",
          reserved_for: null,
          reserved_price: null,
        })
        .eq("id", offer.listing_id)
        .eq("status", "RESERVED")
        .eq("reserved_for", offer.buyer_id)
        .select("id");

      if (freeError) throw freeError;

      if (freed && freed.length > 0) {
        listingsFreed++;
      } else {
        // Listing is not RESERVED for this buyer anymore. Only expire the offer
        // when checkout is not in flight — if it is LOCKED, keep ACCEPTED so
        // release-expired can still revert to RESERVED after a failed payment.
        const { data: listing, error: listingError } = await admin
          .from("listings")
          .select("status, reserved_for")
          .eq("id", offer.listing_id)
          .maybeSingle();

        if (listingError) throw listingError;

        if (!listing || listing.status === "LOCKED") {
          continue;
        }

        if (
          listing.status === "RESERVED" &&
          listing.reserved_for === offer.buyer_id
        ) {
          // Free returned 0 rows but the listing is still ours — retry next run.
          continue;
        }
      }

      const { data: expired, error: expireError } = await admin
        .from("offers")
        .update({ status: "EXPIRED" })
        .eq("id", offer.id)
        .eq("status", "ACCEPTED")
        .select("id");

      if (expireError) throw expireError;
      if (expired && expired.length > 0) expiredAcceptedCount++;
    }

    // ── 3. Heal orphaned RESERVED listings (no ACCEPTED offer left) ────────
    // Recovers rows already stuck by the previous expire-before-free ordering,
    // and any future partial failure between free and expire.
    const { data: reservedListings, error: reservedFetchError } = await admin
      .from("listings")
      .select("id")
      .eq("status", "RESERVED");

    if (reservedFetchError) throw reservedFetchError;

    let orphanedReservationsFreed = 0;
    for (const listing of reservedListings ?? []) {
      const { data: acceptedOffer, error: acceptedLookupError } = await admin
        .from("offers")
        .select("id")
        .eq("listing_id", listing.id)
        .eq("status", "ACCEPTED")
        .maybeSingle();

      if (acceptedLookupError) throw acceptedLookupError;
      if (acceptedOffer) continue;

      const { data: healed, error: healError } = await admin
        .from("listings")
        .update({
          status: "ACTIVE",
          reserved_for: null,
          reserved_price: null,
        })
        .eq("id", listing.id)
        .eq("status", "RESERVED")
        .select("id");

      if (healError) throw healError;
      if (healed && healed.length > 0) orphanedReservationsFreed++;
    }

    return NextResponse.json({
      expired_offers: expiredPendingCount,
      expired_accepted_offers: expiredAcceptedCount,
      listings_freed: listingsFreed + orphanedReservationsFreed,
    });
  } catch (err) {
    console.error("Cron housekeeping error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
