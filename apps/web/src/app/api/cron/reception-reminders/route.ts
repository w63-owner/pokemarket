import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fire the reminder on exactly day 7 after shipping (window of 24 h so the
// daily cron catches each transaction exactly once).
const REMINDER_AFTER_DAYS = 7;

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
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() - REMINDER_AFTER_DAYS);

    const windowStart = new Date(windowEnd);
    windowStart.setDate(windowStart.getDate() - 1);

    const { data: txs, error: fetchError } = await admin
      .from("transactions")
      .select("id, buyer_id, listing_title")
      .eq("status", "SHIPPED")
      .gte("shipped_at", windowStart.toISOString())
      .lt("shipped_at", windowEnd.toISOString());

    if (fetchError) throw fetchError;

    if (!txs || txs.length === 0) {
      return NextResponse.json({ reminders_sent: 0 });
    }

    let sent = 0;
    const errors: string[] = [];

    await Promise.allSettled(
      txs.map(async (tx) => {
        try {
          await sendPushNotification(
            tx.buyer_id,
            "Avez-vous reçu votre commande ? 📦",
            `Confirmez la réception de ${tx.listing_title ?? "votre carte"} pour libérer le paiement au vendeur.`,
            `/orders/${tx.id}`,
            { category: "commerce" },
          );
          sent++;
        } catch (err) {
          Sentry.captureException(err);
          errors.push(
            `tx=${tx.id}: ${err instanceof Error ? err.message : "unknown"}`,
          );
        }
      }),
    );

    return NextResponse.json({
      reminders_sent: sent,
      total_eligible: txs.length,
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[cron/reception-reminders] Failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
