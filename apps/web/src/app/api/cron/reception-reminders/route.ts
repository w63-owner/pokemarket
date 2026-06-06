import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Send reception reminders to buyers at two points:
 *   - Day 7: gentle reminder to confirm reception
 *   - Day 12: warning that auto-completion happens in 2 days
 *
 * Each reminder fires in a 24h window so the daily cron catches
 * each transaction exactly once per reminder point.
 */
const REMINDER_DAYS = [
  {
    days: 7,
    title: "Avez-vous reçu votre commande ? 📦",
    body: (title: string) =>
      `Confirmez la réception de ${title} pour libérer le paiement au vendeur.`,
  },
  {
    days: 12,
    title: "⚠️ Confirmation automatique dans 2 jours",
    body: (title: string) =>
      `Sans action de votre part, la commande ${title} sera automatiquement confirmée le 14e jour.`,
  },
];

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
    let totalSent = 0;
    const allErrors: string[] = [];

    for (const reminder of REMINDER_DAYS) {
      const windowEnd = new Date();
      windowEnd.setDate(windowEnd.getDate() - reminder.days);

      const windowStart = new Date(windowEnd);
      windowStart.setDate(windowStart.getDate() - 1);

      const { data: txs, error: fetchError } = await admin
        .from("transactions")
        .select("id, buyer_id, listing_title")
        .eq("status", "SHIPPED")
        .gte("shipped_at", windowStart.toISOString())
        .lt("shipped_at", windowEnd.toISOString());

      if (fetchError) throw fetchError;

      if (!txs || txs.length === 0) continue;

      await Promise.allSettled(
        txs.map(async (tx) => {
          try {
            await sendPushNotification(
              tx.buyer_id,
              reminder.title,
              reminder.body(tx.listing_title ?? "votre carte"),
              `/orders/${tx.id}`,
              { category: "commerce" },
            );
            totalSent++;
          } catch (err) {
            Sentry.captureException(err);
            allErrors.push(
              `tx=${tx.id} (day ${reminder.days}): ${err instanceof Error ? err.message : "unknown"}`,
            );
          }
        }),
      );
    }

    return NextResponse.json({
      reminders_sent: totalSent,
      ...(allErrors.length > 0 && { errors: allErrors }),
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
