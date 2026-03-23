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
    const { data: expiredOffers, error: fetchError } = await admin
      .from("offers")
      .select("id")
      .eq("status", "PENDING")
      .lt("expires_at", new Date().toISOString());

    if (fetchError) throw fetchError;
    if (!expiredOffers || expiredOffers.length === 0) {
      return NextResponse.json({ expired_offers: 0 });
    }

    const offerIds = expiredOffers.map((o) => o.id);

    const { error: updateError } = await admin
      .from("offers")
      .update({ status: "EXPIRED" })
      .in("id", offerIds);

    if (updateError) throw updateError;

    return NextResponse.json({ expired_offers: expiredOffers.length });
  } catch (err) {
    console.error("Cron housekeeping error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
