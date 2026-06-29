import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push/send";

/**
 * `payout.failed` — the SEPA / bank wire to the seller's IBAN failed
 * (invalid IBAN, closed account, name mismatch, etc.).
 *
 * Critical action items:
 *   1. Mark the local payout record as failed so payout history and support
 *      tooling reflect the bank failure.
 *   2. Notify the seller with a clear next-step ("update your IBAN").
 *
 * Do NOT restore the app wallet here. These events are emitted by the connected
 * account after the platform transfer succeeded; Stripe returns failed bank
 * payouts to the connected account balance. Re-crediting the app wallet would
 * let the seller withdraw the same funds a second time from the platform.
 *
 * Identification:
 *   The payout route stores `metadata.user_id` on every transfer it creates
 *   (see src/app/api/stripe-connect/payout/route.ts ~line 134). We read it
 *   back here to find the seller. If the metadata is missing (e.g. legacy
 *   payout from an admin), we fall back to looking up via stripe_account_id.
 */
export async function handlePayoutFailed(
  payout: Stripe.Payout,
  /** Connected account id from event.account (Connect events only). */
  connectedAccountId: string | null,
): Promise<void> {
  const admin = createAdminClient();

  const userId =
    typeof payout.metadata?.user_id === "string"
      ? payout.metadata.user_id
      : null;

  let sellerId: string | null = userId;
  if (!sellerId && connectedAccountId) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_account_id", connectedAccountId)
      .maybeSingle();
    sellerId = profile?.id ?? null;
  }

  if (!sellerId) {
    Sentry.captureMessage(
      `payout.failed without identifiable user (payout=${payout.id}, account=${connectedAccountId})`,
      { level: "error" },
    );
    return;
  }

  const amountEur = (payout.amount ?? 0) / 100;

  // Update payout record status to failed
  await updatePayoutRecord(admin, payout, {
    status: "failed",
    failure_code: payout.failure_code ?? null,
    failure_message: payout.failure_message ?? null,
    completed_at: new Date().toISOString(),
  });

  Sentry.captureMessage(
    `Payout failed: ${payout.id} amount=${amountEur}€ user=${sellerId} reason=${payout.failure_message ?? payout.failure_code}`,
    { level: "warning", tags: { kind: "stripe_payout", action: "failed" } },
  );

  sendPushNotification(
    sellerId,
    "Virement échoué",
    "Vérifie tes coordonnées bancaires dans Stripe et relance la demande.",
    "/wallet",
  ).catch((err) => Sentry.captureException(err));
}

/**
 * `payout.paid` — the funds have actually landed on the seller's bank
 * account. Stripe reports this 1-3 business days after the payout.
 *
 * Just notify — no DB mutation needed (we already deducted in the payout
 * request).
 */
export async function handlePayoutPaid(
  payout: Stripe.Payout,
  connectedAccountId: string | null,
): Promise<void> {
  const admin = createAdminClient();

  const userId =
    typeof payout.metadata?.user_id === "string"
      ? payout.metadata.user_id
      : null;

  let sellerId: string | null = userId;
  if (!sellerId && connectedAccountId) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_account_id", connectedAccountId)
      .maybeSingle();
    sellerId = profile?.id ?? null;
  }

  // Update payout record status to paid (even if no sellerId for notification).
  await updatePayoutRecord(admin, payout, {
    status: "paid",
    completed_at: new Date().toISOString(),
  });

  if (!sellerId) {
    Sentry.addBreadcrumb({
      category: "stripe_payout",
      level: "info",
      message: `payout.paid without identifiable user (payout=${payout.id})`,
    });
    return;
  }

  const amountEur = (payout.amount ?? 0) / 100;
  sendPushNotification(
    sellerId,
    "Virement reçu 💸",
    `${amountEur.toFixed(2)} € sont arrivés sur ton compte bancaire.`,
    "/wallet",
  ).catch((err) => Sentry.captureException(err));
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function updatePayoutRecord(
  admin: AdminClient,
  payout: Stripe.Payout,
  patch: Record<string, string | null>,
) {
  const payoutRecordId =
    typeof payout.metadata?.payout_record_id === "string" &&
    payout.metadata.payout_record_id.length > 0
      ? payout.metadata.payout_record_id
      : null;

  const query = admin.from("payouts").update(patch).select("id");
  const { data, error } = payoutRecordId
    ? await query.eq("id", payoutRecordId)
    : await query.eq("stripe_payout_id", payout.id);

  if (error) {
    Sentry.captureException(error, {
      extra: {
        context: "payout_record_status_update",
        payout_id: payout.id,
        payout_record_id: payoutRecordId,
      },
    });
    throw error;
  }

  if (!data || data.length === 0) {
    const err = new Error(
      `No payout record found for Stripe payout ${payout.id}`,
    );
    Sentry.captureException(err, {
      extra: {
        context: "payout_record_status_update_missing",
        payout_id: payout.id,
        payout_record_id: payoutRecordId,
      },
    });
    throw err;
  }
}
