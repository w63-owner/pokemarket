import { createElement, type ReactElement } from "react";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/emails/send";
import { sendPushNotification } from "@/lib/push/send";
import OrderConfirmationEmail from "@/emails/order-confirmation";
import SaleNotificationEmail from "@/emails/sale-notification";
import { isCronAuthorized } from "@/lib/cron/auth";
import type {
  EmailOutboxPayload,
  InAppOutboxPayload,
  PushOutboxPayload,
} from "@/lib/notifications/outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How many due rows to drain per tick. Bounded so a single invocation stays
// well within the function timeout even when the backlog is large.
const BATCH_SIZE = 50;

function renderEmailTemplate(payload: EmailOutboxPayload): ReactElement {
  switch (payload.template) {
    case "order-confirmation":
      return createElement(OrderConfirmationEmail, payload.data);
    case "sale-notification":
      return createElement(SaleNotificationEmail, payload.data);
  }
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: due, error: fetchError } = await admin.rpc(
    "claim_notifications_outbox",
    { p_limit: BATCH_SIZE, p_lease_seconds: 120 },
  );

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
      if (!row.lease_token) {
        throw new Error(`Notification ${row.id} was claimed without a lease`);
      }

      if (row.channel === "push") {
        const payload = row.payload as unknown as PushOutboxPayload;
        await sendPushNotification(
          row.recipient_user_id,
          payload.title,
          payload.body,
          payload.url,
          payload.category ? { category: payload.category } : undefined,
        );
      } else if (row.channel === "email") {
        const payload = row.payload as unknown as EmailOutboxPayload;
        await sendEmail(
          payload.to,
          payload.subject,
          renderEmailTemplate(payload),
        );
      } else if (row.channel === "in_app") {
        const payload = row.payload as unknown as InAppOutboxPayload;
        const { error: messageError } = await admin.from("messages").insert({
          conversation_id: payload.conversationId,
          sender_id: payload.senderId,
          content: payload.content,
          message_type: payload.messageType,
          metadata: payload.metadata,
        });
        if (messageError && messageError.code !== "23505") throw messageError;
      } else {
        throw new Error(`Unsupported notification channel: ${row.channel}`);
      }

      const { data: completed, error: sentError } = await admin.rpc(
        "complete_notifications_outbox",
        { p_id: row.id, p_lease_token: row.lease_token },
      );
      if (sentError) throw sentError;
      if (!completed) throw new Error(`Notification lease lost for ${row.id}`);
      sent++;
    } catch (err) {
      const exhausted = row.attempts + 1 >= row.max_attempts;
      const message = err instanceof Error ? err.message : String(err);

      const leaseToken = row.lease_token;
      const { data: released, error: updateError } = leaseToken
        ? await admin.rpc("fail_notifications_outbox", {
            p_id: row.id,
            p_lease_token: leaseToken,
            p_error: message,
          })
        : { data: false, error: null };

      if (updateError || !released) {
        Sentry.captureException(
          updateError ??
            new Error(`Unable to release notification lease ${row.id}`),
          {
            tags: { component: "drain-notifications" },
            extra: { outboxId: row.id },
          },
        );
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
