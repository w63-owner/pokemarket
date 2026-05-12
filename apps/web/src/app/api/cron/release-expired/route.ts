import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const listingIds = [...new Set(expired.map((t) => t.listing_id))];

    const { error: txError } = await admin
      .from("transactions")
      .update({ status: "EXPIRED" })
      .in("id", transactionIds);

    if (txError) throw txError;

    for (const listingId of listingIds) {
      const { data: acceptedOffer } = await admin
        .from("offers")
        .select("id")
        .eq("listing_id", listingId)
        .eq("status", "ACCEPTED")
        .maybeSingle();

      const newStatus = acceptedOffer ? "RESERVED" : "ACTIVE";

      await admin
        .from("listings")
        .update({ status: newStatus })
        .eq("id", listingId)
        .eq("status", "LOCKED");
    }

    return NextResponse.json({ released: expired.length });
  } catch (err) {
    console.error("Cron release-expired error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
