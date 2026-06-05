import { createElement, type ReactElement } from "react";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/emails/send";
import { sendPushNotification } from "@/lib/push/send";
import OrderConfirmationEmail from "@/emails/order-confirmation";
import SaleNotificationEmail from "@/emails/sale-notification";
import type {
  EmailOutboxPayload,
  PushOutboxPayload,
} from "@/lib/notifications/outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How many due rows to drain per tick. Bounded so a single invocation stays
// well within the function timeout even when the backlog is large.
const BATCH_SIZE = 50;

// Exponential backoff base in minutes: retry after 2, 4, 8, 16 minutes, capped.
const BACKOFF_BASE_MINUTES = 2;
const BACKOFF_CAP_MINUTES = 60;

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

function nextAttemptAt(attempts: number): string {
  const minutes = Math.min(
    BACKOFF_CAP_MINUTES,
    BACKOFF_BASE_MINUTES * 2 ** (attempts - 1),
  );
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function renderEmailTemplate(payload: EmailOutboxPayload): ReactElement {
  switch (payload.template) {
    case "order-confirmation":
      return createElement(OrderConfirmationEmail, payload.data);
    case "sale-notification":
      return createElement(SaleNotificationEmail, payload.data);
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: due, error: fetchError } = await admin
    .from("notifications_outbox")
    .select("*")
    .eq("status", "PENDING")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError) {
    console.error("[drain-notifications] fetch error:", fetchError);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, retried: 0 });
  }

  let sent = 0;
  let failed = 0;
  let retried = 0;

  for (const row of due) {
    try {
      // NOTE: sendEmail / sendPushNotification are best-effort and swallow
      // provider-level errors internally (logging + Sentry). They only throw
      // on unexpected faults (DB lookups, malformed payloads). The retry path
      // below therefore covers transient infra failures; provider drops are
      // observed via the helpers' own Sentry capture. See report limitations.
      if (row.channel === "push") {
        const payload = row.payload as unknown as PushOutboxPayload;
        await sendPushNotification(
          row.recipient_user_id,
          payload.title,
          payload.body,
          payload.url,
          payload.category ? { category: payload.category } : undefined,
        );
      } else {
        const payload = row.payload as unknown as EmailOutboxPayload;
        await sendEmail(
          payload.to,
          payload.subject,
          renderEmailTemplate(payload),
        );
      }

      const { error: sentError } = await admin
        .from("notifications_outbox")
        .update({ status: "SENT", sent_at: new Date().toISOString() })
        .eq("id", row.id);
      if (sentError) throw sentError;
      sent++;
    } catch (err) {
      const attempts = row.attempts + 1;
      const exhausted = attempts >= row.max_attempts;
      const message = err instanceof Error ? err.message : String(err);

      const { error: updateError } = await admin
        .from("notifications_outbox")
        .update({
          attempts,
          last_error: message.slice(0, 1000),
          status: exhausted ? "FAILED" : "PENDING",
          next_attempt_at: exhausted
            ? row.next_attempt_at
            : nextAttemptAt(attempts),
        })
        .eq("id", row.id);

      if (updateError) {
        Sentry.captureException(updateError, {
          tags: { component: "drain-notifications" },
          extra: { outboxId: row.id },
        });
      }

      if (exhausted) {
        failed++;
        Sentry.captureMessage(
          `[drain-notifications] notification ${row.id} (${row.channel}) exhausted ${row.max_attempts} attempts: ${message}`,
          "error",
        );
      } else {
        retried++;
      }
    }
  }

  return NextResponse.json({
    processed: due.length,
    sent,
    failed,
    retried,
  });
}
