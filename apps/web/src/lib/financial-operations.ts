import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const ROW_LIMIT = 50;
const STALE_JOB_MINUTES = 5;

export async function getFinancialOperationsSnapshot() {
  const admin = createAdminClient();
  const now = new Date();
  const staleBefore = new Date(
    now.getTime() - STALE_JOB_MINUTES * 60_000,
  ).toISOString();

  const [
    jobsResult,
    recoveriesResult,
    risksResult,
    refundsResult,
    disputesResult,
    payoutsResult,
    reconciliationResult,
  ] = await Promise.all([
    admin
      .from("financial_outbox")
      .select(
        "id, aggregate_id, event_type, status, attempts, max_attempts, next_attempt_at, lease_expires_at, last_error, created_at",
      )
      .or(
        `status.eq.FAILED,and(status.eq.PROCESSING,lease_expires_at.lt.${staleBefore}),and(status.eq.PENDING,next_attempt_at.lt.${staleBefore})`,
      )
      .order("created_at", { ascending: true })
      .limit(ROW_LIMIT),
    admin
      .from("financial_recoveries")
      .select(
        "id, transaction_id, seller_id, kind, status, target_amount_minor, completed_amount_minor, attempts, last_error, updated_at",
      )
      .in("status", ["failed", "processing"])
      .order("updated_at", { ascending: true })
      .limit(ROW_LIMIT),
    admin
      .from("seller_risk_accounts")
      .select(
        "seller_id, debt_minor, locked_minor, payouts_blocked, alert_level, updated_at",
      )
      .gt("debt_minor", 0)
      .order("debt_minor", { ascending: false })
      .limit(ROW_LIMIT),
    admin
      .from("transactions")
      .select(
        "id, seller_id, status, refunded_amount_minor, seller_refund_target_minor, seller_refunded_minor, updated_at",
      )
      .gt("refunded_amount_minor", 0)
      .order("updated_at", { ascending: true })
      .limit(ROW_LIMIT),
    admin
      .from("stripe_disputes")
      .select(
        "id, stripe_dispute_id, transaction_id, status, evidence_due_by, evidence_submitted_at, amount_minor, currency",
      )
      .in("status", ["warning_needs_response", "needs_response"])
      .is("evidence_submitted_at", null)
      .order("evidence_due_by", { ascending: true })
      .limit(ROW_LIMIT),
    admin
      .from("payouts")
      .select(
        "id, user_id, amount_minor, currency, status, failure_code, failure_message, stripe_payout_id, updated_at",
      )
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(ROW_LIMIT),
    admin
      .from("financial_reconciliation_alerts")
      .select(
        "alert_type, entity_id, expected_minor, actual_minor, detected_at, details",
      )
      .limit(ROW_LIMIT),
  ]);

  const results = [
    jobsResult,
    recoveriesResult,
    risksResult,
    refundsResult,
    disputesResult,
    payoutsResult,
    reconciliationResult,
  ];
  const queryError = results.find((result) => result.error)?.error;
  if (queryError) throw queryError;

  const pendingRefunds = (refundsResult.data ?? []).filter(
    (row) => row.seller_refunded_minor < row.seller_refund_target_minor,
  );
  const evidenceDueSoon = (disputesResult.data ?? []).filter((row) => {
    if (!row.evidence_due_by) return false;
    const remaining = new Date(row.evidence_due_by).getTime() - now.getTime();
    return remaining <= 72 * 60 * 60_000;
  });

  return {
    generatedAt: now.toISOString(),
    stuckJobs: jobsResult.data ?? [],
    failedRecoveries: recoveriesResult.data ?? [],
    sellerDebts: risksResult.data ?? [],
    pendingRefunds,
    evidenceDeadlines: disputesResult.data ?? [],
    evidenceDueSoon,
    failedPayouts: payoutsResult.data ?? [],
    reconciliationAlerts: reconciliationResult.data ?? [],
  };
}

export type FinancialOperationsSnapshot = Awaited<
  ReturnType<typeof getFinancialOperationsSnapshot>
>;
