import * as Sentry from "@sentry/nextjs";
import type { Json, PushNotificationCategory } from "@deckdealr/shared";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export const OUTBOX_CHANNELS = ["push", "email", "in_app"] as const;
export type OutboxChannel = (typeof OUTBOX_CHANNELS)[number];

// ── Payloads ────────────────────────────────────────────────────────────────
// Each payload is fully self-contained: the drain cron renders/sends straight
// from it without re-fetching, so a notification can never drift from the state
// that existed when the order was finalized.

export type PushOutboxPayload = {
  title: string;
  body: string;
  url?: string;
  category?: PushNotificationCategory;
};

// Discriminant telling the drain which React Email template to render. Keep in
// sync with the templates under `@/emails`.
export type EmailTemplate = "order-confirmation" | "sale-notification";

export type OrderConfirmationEmailData = {
  buyerName: string;
  listingTitle: string;
  totalAmount: string;
  orderId: string;
  coverImageUrl?: string | null;
};

export type SaleNotificationEmailData = {
  sellerName: string;
  listingTitle: string;
  saleAmount: string;
  orderId: string;
  coverImageUrl?: string | null;
};

// `to` is snapshotted at enqueue time so the drain doesn't need an extra
// auth.admin.getUserById round-trip (and survives an email change on the user).
export type EmailOutboxPayload =
  | {
      template: "order-confirmation";
      to: string;
      subject: string;
      data: OrderConfirmationEmailData;
    }
  | {
      template: "sale-notification";
      to: string;
      subject: string;
      data: SaleNotificationEmailData;
    };

export type InAppOutboxPayload = {
  conversationId: string;
  senderId: string;
  content: string;
  messageType: string;
  metadata: Json;
};

export type EnqueueNotificationInput =
  | {
      channel: "push";
      recipientUserId: string;
      payload: PushOutboxPayload;
      idempotencyKey?: string;
    }
  | {
      channel: "email";
      recipientUserId: string;
      payload: EmailOutboxPayload;
      idempotencyKey?: string;
    }
  | {
      channel: "in_app";
      recipientUserId: string;
      payload: InAppOutboxPayload;
      idempotencyKey?: string;
    };

/**
 * Durably enqueue a notification for the drain cron to deliver.
 *
 * An UPSERT keyed by `idempotency_key` makes retries safe. Calls without a key
 * still behave like regular inserts because PostgreSQL permits multiple NULLs
 * in the unique index.
 */
export async function enqueueNotification(
  admin: AdminClient,
  input: EnqueueNotificationInput,
): Promise<{ ok: boolean }> {
  const { error } = await admin.from("notifications_outbox").upsert(
    {
      channel: input.channel,
      recipient_user_id: input.recipientUserId,
      payload: input.payload as unknown as Json,
      idempotency_key: input.idempotencyKey ?? null,
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );

  if (error) {
    Sentry.captureException(error, {
      tags: { component: "notifications-outbox" },
      extra: { channel: input.channel, recipientUserId: input.recipientUserId },
    });
    return { ok: false };
  }

  return { ok: true };
}
