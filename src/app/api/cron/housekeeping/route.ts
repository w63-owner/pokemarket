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
        .in("id", offerIds);
      if (updateError) throw updateError;
      expiredPendingCount = expiredPending.length;
    }

    // ── 2. Expire stale ACCEPTED offers and free their reserved listings ──
    // An ACCEPTED offer that the buyer never paid for blocks the listing.
    // We use the offer's created_at as the reservation timestamp and revert
    // the listing to ACTIVE if the TTL has elapsed.
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

    if (staleAccepted && staleAccepted.length > 0) {
      const offerIds = staleAccepted.map((o) => o.id);
      const { error: updateError } = await admin
        .from("offers")
        .update({ status: "EXPIRED" })
        .in("id", offerIds);
      if (updateError) throw updateError;
      expiredAcceptedCount = staleAccepted.length;

      // Free each reserved listing — only if it's still RESERVED for the
      // same buyer (we don't want to override a listing that was paid for
      // and is now SOLD/LOCKED while we ran).
      for (const offer of staleAccepted) {
        const { data: freed } = await admin
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
        if (freed && freed.length > 0) listingsFreed++;
      }
    }

    return NextResponse.json({
      expired_offers: expiredPendingCount,
      expired_accepted_offers: expiredAcceptedCount,
      listings_freed: listingsFreed,
    });
  } catch (err) {
    console.error("Cron housekeeping error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
