import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push/send";

/**
 * `payout.failed` — the SEPA / bank wire to the seller's IBAN failed
 * (invalid IBAN, closed account, name mismatch, etc.).
 *
 * Critical action items:
 *   1. Mark the payout record as failed.
 *   2. Notify the seller with a clear next-step ("update your IBAN").
 *
 * We deliberately DO NOT restore wallet.available_balance here. A
 * `payout.failed` event means the platform→connected-account transfer already
 * succeeded and only the connected-account→bank payout failed. Re-crediting the
 * platform wallet would let the seller request a second platform transfer while
 * the first transfer remains on their connected account.
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
  const payoutRecordId =
    typeof payout.metadata?.payout_record_id === "string" &&
    payout.metadata.payout_record_id.length > 0
      ? payout.metadata.payout_record_id
      : null;
  const transferId =
    typeof payout.metadata?.transfer_id === "string"
      ? payout.metadata.transfer_id
      : null;

  const failedPatch = {
    status: "failed" as const,
    failure_code: payout.failure_code ?? null,
    failure_message: payout.failure_message ?? null,
    completed_at: new Date().toISOString(),
  };

  const payoutUpdate = admin.from("payouts").update(failedPatch);
  const { error: payoutUpdateError } = payoutRecordId
    ? await payoutUpdate.eq("id", payoutRecordId)
    : await payoutUpdate.eq("stripe_payout_id", payout.id);

  if (payoutUpdateError) {
    Sentry.captureException(payoutUpdateError, {
      extra: { context: "payout_record_failed_update", payout_id: payout.id },
    });
  }

  if (!payoutRecordId && transferId) {
    const { error: transferUpdateError } = await admin
      .from("payouts")
      .update(failedPatch)
      .eq("stripe_transfer_id", transferId)
      .eq("user_id", sellerId);

    if (transferUpdateError) {
      Sentry.captureException(transferUpdateError, {
        extra: {
          context: "payout_record_failed_transfer_update",
          payout_id: payout.id,
          transfer_id: transferId,
        },
      });
    }
  }

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

  // Update payout record status to paid (even if no sellerId for notification)
  const { error: payoutUpdateError } = await admin
    .from("payouts")
    .update({
      status: "paid",
      completed_at: new Date().toISOString(),
    })
    .eq("stripe_payout_id", payout.id);

  if (payoutUpdateError) {
    Sentry.captureException(payoutUpdateError, {
      extra: { context: "payout_record_paid_update", payout_id: payout.id },
    });
  }

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
