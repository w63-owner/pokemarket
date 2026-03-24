import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendShippingReminderEmail } from "@/lib/emails/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHIPPING_DELAY_DAYS = 3;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pokemarket.fr";

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
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - SHIPPING_DELAY_DAYS);

    const { data: pendingShipments, error: fetchError } = await admin
      .from("transactions")
      .select("id, seller_id, listing_title, created_at")
      .eq("status", "PAID")
      .is("shipped_at", null)
      .lt("created_at", cutoffDate.toISOString());

    if (fetchError) throw fetchError;
    if (!pendingShipments || pendingShipments.length === 0) {
      return NextResponse.json({ reminders_sent: 0 });
    }

    const sellerIds = [...new Set(pendingShipments.map((t) => t.seller_id))];

    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, username")
      .in("id", sellerIds);

    if (profilesError) throw profilesError;

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    const emailMap = new Map<string, string>();
    await Promise.all(
      sellerIds.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        if (data?.user?.email) emailMap.set(id, data.user.email);
      }),
    );

    let sent = 0;
    const errors: string[] = [];

    await Promise.allSettled(
      pendingShipments.map(async (tx) => {
        const profile = profileMap.get(tx.seller_id);
        const email = emailMap.get(tx.seller_id);
        if (!email) return;

        const daysSincePaid = Math.floor(
          (Date.now() - new Date(tx.created_at!).getTime()) /
            (1000 * 60 * 60 * 24),
        );

        try {
          await sendShippingReminderEmail(email, {
            sellerName: profile?.username ?? "Vendeur",
            listingTitle: tx.listing_title ?? "Votre carte",
            orderId: tx.id,
            daysSincePaid,
            transactionUrl: `${APP_URL}/profile/transactions`,
          });
          sent++;
        } catch (err) {
          errors.push(
            `tx=${tx.id}: ${err instanceof Error ? err.message : "unknown"}`,
          );
        }
      }),
    );

    return NextResponse.json({
      reminders_sent: sent,
      total_pending: pendingShipments.length,
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    console.error("Cron shipping-reminders error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
