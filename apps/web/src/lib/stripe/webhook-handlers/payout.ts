import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push/send";

/**
 * `payout.failed` — the SEPA / bank wire to the seller's IBAN failed
 * (invalid IBAN, closed account, name mismatch, etc.).
 *
 * Critical action items:
 *   1. RESTORE the seller's available_balance — our /api/stripe-connect/payout
 *      route deducts the wallet BEFORE asking Stripe to transfer. If Stripe
 *      then fails to land the funds, the seller is short until we restore.
 *   2. Notify the seller with a clear next-step ("update your IBAN").
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

  // Restore the available balance. CAUTION: if multiple payouts failed in
  // parallel, this is non-idempotent at the row level. The webhook layer's
  // event-id idempotency is what protects us.
  const { data: wallet } = await admin
    .from("wallets")
    .select("available_balance")
    .eq("user_id", sellerId)
    .single();

  if (wallet) {
    const newAvailable =
      Math.round((Number(wallet.available_balance) + amountEur) * 100) / 100;
    const { error } = await admin
      .from("wallets")
      .update({ available_balance: newAvailable })
      .eq("user_id", sellerId);
    if (error) {
      Sentry.captureException(error, {
        extra: {
          context: "payout.failed_restore",
          user_id: sellerId,
          amount: amountEur,
        },
      });
    }
  }

  // Update payout record status to failed
  const { error: payoutUpdateError } = await admin
    .from("payouts")
    .update({
      status: "failed",
      failure_code: payout.failure_code ?? null,
      failure_message: payout.failure_message ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("stripe_payout_id", payout.id);

  if (payoutUpdateError) {
    Sentry.captureException(payoutUpdateError, {
      extra: { context: "payout_record_failed_update", payout_id: payout.id },
    });
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
