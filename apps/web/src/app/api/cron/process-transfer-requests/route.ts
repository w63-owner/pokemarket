import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { executeReservedPayout } from "@/lib/stripe/execute-payout";
import {
  executeFinancialRecovery,
  FinancialRecoveryBusyError,
} from "@/lib/stripe/execute-financial-recovery";
import { executeSellerTransfer } from "@/lib/stripe/execute-transfer";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_SIZE = 25;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return (
    typeof secret === "string" &&
    secret.length > 0 &&
    request.headers.get("authorization") === `Bearer ${secret}`
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: jobs, error } = await admin.rpc("claim_financial_outbox", {
    p_event_types: [
      "transfer_requested",
      "transfer_reversal_requested",
      "dispute_retransfer_requested",
    ],
    p_limit: BATCH_SIZE,
    p_lease_seconds: 180,
  });

  if (error) {
    Sentry.captureException(error, {
      tags: { component: "process-transfer-requests" },
    });
    return NextResponse.json(
      { error: "Unable to claim transfer jobs" },
      { status: 500 },
    );
  }

  let completed = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    const leaseToken = job.lease_token;

    try {
      if (!leaseToken) throw new Error(`Financial job ${job.id} has no lease`);

      if (job.event_type === "transfer_requested") {
        await executeSellerTransfer(job.aggregate_id);
      } else {
        const recoveryId = readRecoveryId(job.payload);
        if (typeof recoveryId !== "string") {
          throw new Error(
            `Financial recovery job ${job.id} has no recovery_id`,
          );
        }
        try {
          await executeFinancialRecovery(recoveryId);
        } catch (cause) {
          // Another worker holds the recovery lease. Re-queue without burning
          // toward terminal failure / seller-debt abandonment.
          if (cause instanceof FinancialRecoveryBusyError) {
            const { data: released, error: releaseError } = await admin.rpc(
              "release_financial_outbox",
              {
                p_id: job.id,
                p_lease_token: leaseToken,
                p_delay_seconds: 30,
              },
            );
            if (releaseError) throw releaseError;
            if (!released) {
              throw new Error(`Financial lease lost for ${job.id}`);
            }
            continue;
          }
          throw cause;
        }
      }

      const { data: acknowledged, error: acknowledgeError } = await admin.rpc(
        "complete_financial_outbox",
        { p_id: job.id, p_lease_token: leaseToken },
      );
      if (acknowledgeError) throw acknowledgeError;
      if (!acknowledged) throw new Error(`Financial lease lost for ${job.id}`);
      completed++;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const recoveryId = readRecoveryId(job.payload);
      const { data: released, error: releaseError } = leaseToken
        ? await admin.rpc("fail_financial_outbox", {
            p_id: job.id,
            p_lease_token: leaseToken,
            p_error: message,
          })
        : { data: false, error: null };

      // When reverse retries are exhausted because Connect has no balance left
      // to pull back, convert the unrecovered liability into seller_debt.
      // Do not abandon on ambiguous/network errors — those may have already
      // created a Stripe reversal and need operator reconciliation.
      if (
        released &&
        typeof recoveryId === "string" &&
        job.event_type === "transfer_reversal_requested" &&
        isPermanentConnectReversalFailure(message)
      ) {
        const { data: outboxRow, error: outboxError } = await admin
          .from("financial_outbox")
          .select("status")
          .eq("id", job.id)
          .maybeSingle();
        if (outboxError) {
          Sentry.captureException(outboxError, {
            tags: { component: "process-transfer-requests" },
            extra: { jobId: job.id, recoveryId },
          });
        } else if (outboxRow?.status === "FAILED") {
          const { error: abandonError } = await admin.rpc(
            "abandon_financial_recovery",
            {
              p_recovery_id: recoveryId,
              p_error: message,
            },
          );
          if (abandonError) {
            Sentry.captureException(abandonError, {
              tags: { component: "process-transfer-requests" },
              extra: { jobId: job.id, recoveryId },
            });
          }
        }
      }

      Sentry.captureException(cause, {
        tags: { component: "process-transfer-requests" },
        extra: {
          transactionId: job.aggregate_id,
          jobId: job.id,
          releaseError: releaseError?.message,
          released,
        },
      });
      failed++;
    }
  }

  const { data: pendingPayouts, error: payoutQueryError } = await admin
    .from("payouts")
    .select("id")
    .in("status", ["pending", "in_transit"])
    .order("requested_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (payoutQueryError) {
    Sentry.captureException(payoutQueryError, {
      tags: { component: "process-transfer-requests" },
    });
  }

  let payoutsReconciled = 0;
  let payoutsFailed = 0;
  for (const payout of pendingPayouts ?? []) {
    try {
      await executeReservedPayout(payout.id);
      payoutsReconciled++;
    } catch (cause) {
      Sentry.captureException(cause, {
        tags: { component: "process-transfer-requests" },
        extra: { payoutId: payout.id },
      });
      payoutsFailed++;
    }
  }

  return NextResponse.json({
    processed: jobs?.length ?? 0,
    completed,
    failed,
    payoutsReconciled,
    payoutsFailed,
  });
}

function readRecoveryId(payload: unknown): string | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return null;
  }
  const recoveryId = (payload as Record<string, unknown>).recovery_id;
  return typeof recoveryId === "string" ? recoveryId : null;
}

function isPermanentConnectReversalFailure(message: string): boolean {
  return /insufficient_funds|insufficient funds|balance_insufficient|cannot.*reverse/i.test(
    message,
  );
}
