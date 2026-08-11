import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { getFinancialOperationsSnapshot } from "@/lib/financial-operations";
import { isCronAuthorized } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await getFinancialOperationsSnapshot();
    const counts = {
      stuck_jobs: snapshot.stuckJobs.length,
      failed_recoveries: snapshot.failedRecoveries.length,
      reconciliation_alerts: snapshot.reconciliationAlerts.length,
      sellers_with_debt: snapshot.sellerDebts.length,
      pending_refunds: snapshot.pendingRefunds.length,
      evidence_due_soon: snapshot.evidenceDueSoon.length,
      failed_payouts: snapshot.failedPayouts.length,
    };
    const critical =
      counts.stuck_jobs +
      counts.failed_recoveries +
      counts.reconciliation_alerts +
      counts.evidence_due_soon +
      counts.failed_payouts;

    if (critical > 0) {
      Sentry.captureMessage("Financial operations require intervention", {
        level: "error",
        fingerprint: ["financial-operations-monitor"],
        tags: { component: "financial-operations-monitor" },
        extra: counts,
      });
    } else if (counts.sellers_with_debt > 0 || counts.pending_refunds > 0) {
      Sentry.captureMessage("Financial operations have open risk items", {
        level: "warning",
        fingerprint: ["financial-operations-risk-monitor"],
        tags: { component: "financial-operations-monitor" },
        extra: counts,
      });
    }

    return NextResponse.json({ healthy: critical === 0, ...counts });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: "financial-operations-monitor" },
    });
    return NextResponse.json(
      { error: "Unable to monitor financial operations" },
      { status: 500 },
    );
  }
}
