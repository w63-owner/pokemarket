import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || !auth) return false;
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const { data: expired, error: fetchError } = await admin
      .from("transactions")
      .select("id, listing_id")
      .eq("status", "PENDING_PAYMENT")
      .lt("expiration_date", new Date().toISOString());

    if (fetchError) throw fetchError;
    if (!expired || expired.length === 0) {
      return NextResponse.json({ released: 0 });
    }

    const transactionIds = expired.map((t) => t.id);

    const { data: releasedTransactions, error: txError } = await admin
      .from("transactions")
      .update({ status: "EXPIRED" })
      .in("id", transactionIds)
      .eq("status", "PENDING_PAYMENT")
      .select("id, listing_id");

    if (txError) throw txError;
    if (!releasedTransactions || releasedTransactions.length === 0) {
      return NextResponse.json({ released: 0 });
    }

    const listingIds = [
      ...new Set(releasedTransactions.map((t) => t.listing_id)),
    ];

    for (const listingId of listingIds) {
      const { data: acceptedOffer, error: acceptedOfferError } = await admin
        .from("offers")
        .select("id")
        .eq("listing_id", listingId)
        .eq("status", "ACCEPTED")
        .limit(1)
        .maybeSingle();

      if (acceptedOfferError) throw acceptedOfferError;

      const newStatus = acceptedOffer ? "RESERVED" : "ACTIVE";

      const { error: listingUpdateError } = await admin
        .from("listings")
        .update({ status: newStatus })
        .eq("id", listingId)
        .eq("status", "LOCKED");
      if (listingUpdateError) throw listingUpdateError;
    }

    return NextResponse.json({ released: releasedTransactions.length });
  } catch (err) {
    console.error("Cron release-expired error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
