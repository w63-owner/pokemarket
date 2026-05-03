import { createElement } from "react";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/emails/send";
import { formatPrice } from "@/lib/utils";
import WeeklyStripeReportEmail from "@/emails/weekly-stripe-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Threshold above which we raise a Sentry alert in the same run.
// Tuned conservatively for early-stage volume; revisit when GMV > 50k/month.
const PAYOUT_FAIL_ALERT_THRESHOLD = 3;
const CHARGEBACK_ALERT_THRESHOLD = 1;

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  const admin = createAdminClient();

  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const weekAgoIso = weekAgo.toISOString();

    const [refundsRes, internalRes, stripeRes, payoutFailRes, gmvRes] =
      await Promise.all([
        admin
          .from("transactions")
          .select("refunded_amount, refunded_at")
          .gt("refunded_at", weekAgoIso),
        admin.from("disputes").select("id").gt("created_at", weekAgoIso),
        admin
          .from("stripe_disputes")
          .select("status, created_at")
          .gt("created_at", weekAgoIso),
        admin
          .from("admin_audit_log")
          .select("id, metadata")
          .eq("action", "payout.failed")
          .gt("created_at", weekAgoIso),
        admin
          .from("transactions")
          .select("total_amount")
          .eq("status", "PAID")
          .gt("created_at", weekAgoIso),
      ]);

    const refundRows = refundsRes.data ?? [];
    const refundCount = refundRows.length;
    const refundTotal = refundRows.reduce(
      (sum, r) => sum + Number(r.refunded_amount ?? 0),
      0,
    );

    const internalDisputesOpened = internalRes.data?.length ?? 0;

    const stripeRows = stripeRes.data ?? [];
    const stripeChargebacksOpened = stripeRows.length;
    const stripeChargebacksWon = stripeRows.filter(
      (r) => r.status === "won",
    ).length;
    const stripeChargebacksLost = stripeRows.filter(
      (r) => r.status === "lost",
    ).length;

    const payoutFailures = payoutFailRes.data?.length ?? 0;

    const gmv = (gmvRes.data ?? []).reduce(
      (sum, t) => sum + Number(t.total_amount ?? 0),
      0,
    );
    const disputeRate = gmv > 0 ? (stripeChargebacksOpened / gmv) * 100 : 0;

    if (payoutFailures >= PAYOUT_FAIL_ALERT_THRESHOLD) {
      Sentry.captureMessage(
        `[stripe-weekly-report] ${payoutFailures} payout failures this week`,
        { level: "error", extra: { payoutFailures } },
      );
    }
    if (stripeChargebacksOpened >= CHARGEBACK_ALERT_THRESHOLD) {
      Sentry.captureMessage(
        `[stripe-weekly-report] ${stripeChargebacksOpened} chargebacks opened this week`,
        {
          level: "warning",
          extra: { stripeChargebacksOpened, stripeChargebacksLost },
        },
      );
    }

    const reportPayload = {
      weekStart: weekAgo.toLocaleDateString("fr-FR"),
      weekEnd: now.toLocaleDateString("fr-FR"),
      refundCount,
      refundTotal: formatPrice(refundTotal),
      internalDisputesOpened,
      stripeChargebacksOpened,
      stripeChargebacksWon,
      stripeChargebacksLost,
      payoutFailures,
      gmv: formatPrice(gmv),
      disputeRatePercent: `${disputeRate.toFixed(2)} %`,
    };

    if (adminEmail) {
      await sendEmail(
        adminEmail,
        `[PokeMarket] Rapport Stripe hebdo — ${reportPayload.weekStart} → ${reportPayload.weekEnd}`,
        createElement(WeeklyStripeReportEmail, reportPayload),
      );
    }

    return NextResponse.json({
      sent: !!adminEmail,
      ...reportPayload,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("Cron stripe-weekly-report error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
