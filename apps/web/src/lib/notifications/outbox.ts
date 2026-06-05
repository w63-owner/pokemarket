import * as Sentry from "@sentry/nextjs";
import type { Json, PushNotificationCategory } from "@pokemarket/shared";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export const OUTBOX_CHANNELS = ["push", "email"] as const;
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

export type EnqueueNotificationInput =
  | { channel: "push"; recipientUserId: string; payload: PushOutboxPayload }
  | { channel: "email"; recipientUserId: string; payload: EmailOutboxPayload };

/**
 * Durably enqueue a push/email notification for the drain cron to deliver.
 *
 * A single INSERT — intentionally lightweight so callers can fire it inline
 * inside a webhook/Server Action. Callers that have already committed strong
 * state (e.g. a PAID transaction) should treat enqueue failures as non-fatal:
 * the in-app system message remains the strong guarantee, so we log to Sentry
 * and move on rather than failing the whole flow over a soft-channel insert.
 */
export async function enqueueNotification(
  admin: AdminClient,
  input: EnqueueNotificationInput,
): Promise<{ ok: boolean }> {
  const { error } = await admin.from("notifications_outbox").insert({
    channel: input.channel,
    recipient_user_id: input.recipientUserId,
    payload: input.payload as unknown as Json,
  });

  if (error) {
    Sentry.captureException(error, {
      tags: { component: "notifications-outbox" },
      extra: { channel: input.channel, recipientUserId: input.recipientUserId },
    });
    return { ok: false };
  }

  return { ok: true };
}
