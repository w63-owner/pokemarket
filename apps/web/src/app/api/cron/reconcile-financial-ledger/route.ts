import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { processPaidTransactionEffects } from "@/lib/stripe/post-payment";

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
    p_event_types: ["payment_finalized"],
    p_limit: BATCH_SIZE,
    p_lease_seconds: 120,
  });

  if (error) {
    Sentry.captureException(error, {
      tags: { component: "reconcile-financial-ledger" },
    });
    return NextResponse.json(
      { error: "Unable to claim financial jobs" },
      { status: 500 },
    );
  }

  let completed = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    const leaseToken = job.lease_token;
    try {
      if (!leaseToken) throw new Error(`Financial job ${job.id} has no lease`);
      await processPaidTransactionEffects(job.aggregate_id);

      const { data: acknowledged, error: acknowledgeError } = await admin.rpc(
        "complete_financial_outbox",
        { p_id: job.id, p_lease_token: leaseToken },
      );
      if (acknowledgeError) throw acknowledgeError;
      if (!acknowledged) throw new Error(`Financial lease lost for ${job.id}`);
      completed++;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const { data: released, error: releaseError } = leaseToken
        ? await admin.rpc("fail_financial_outbox", {
            p_id: job.id,
            p_lease_token: leaseToken,
            p_error: message,
          })
        : { data: false, error: null };

      Sentry.captureException(cause, {
        tags: { component: "reconcile-financial-ledger" },
        extra: {
          jobId: job.id,
          releaseError: releaseError?.message,
          released,
        },
      });
      failed++;
    }
  }

  return NextResponse.json({
    processed: jobs?.length ?? 0,
    completed,
    failed,
  });
}
