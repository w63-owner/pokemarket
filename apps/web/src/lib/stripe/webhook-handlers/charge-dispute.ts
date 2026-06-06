import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { calcPriceSeller } from "@/lib/pricing";
import { sendPushNotification } from "@/lib/push/send";

/**
 * Stripe `Dispute.status` values we accept. Keep this in sync with
 * supabase/migrations/00049_stripe_disputes.sql.
 */
const VALID_DISPUTE_STATUSES = new Set([
  "warning_needs_response",
  "warning_under_review",
  "warning_closed",
  "needs_response",
  "under_review",
  "charge_refunded",
  "won",
  "lost",
]);

const RESOLVED_STATUSES = new Set([
  "warning_closed",
  "charge_refunded",
  "won",
  "lost",
]);

/**
 * `charge.dispute.created` — a chargeback was opened by the issuing bank.
 *
 * Critical action items:
 *   1. INSERT a row in stripe_disputes (idempotent via UNIQUE stripe_dispute_id).
 *   2. Lock the seller's pending_balance to prevent payout of contested funds.
 *   3. Update the transaction status to DISPUTED.
 *   4. Alert admin urgently (deadline can be as short as 7 days).
 */
export async function handleChargeDisputeCreated(
  dispute: Stripe.Dispute,
): Promise<void> {
  const admin = createAdminClient();
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;

  // Find the matching transaction (may be null if charge is from outside our flow).
  const { data: transaction } = await admin
    .from("transactions")
    .select("id, seller_id, total_amount, shipping_cost, status")
    .eq("stripe_charge_id", chargeId)
    .maybeSingle();

  // Insert the dispute row first so we have an audit trail even if the
  // wallet update fails. ON CONFLICT DO NOTHING gives idempotency on retry.
  const status = VALID_DISPUTE_STATUSES.has(dispute.status)
    ? dispute.status
    : "needs_response";
  const { error: insertError } = await admin.from("stripe_disputes").insert({
    stripe_dispute_id: dispute.id,
    stripe_charge_id: chargeId,
    transaction_id: transaction?.id ?? null,
    amount: dispute.amount / 100,
    currency: (dispute.currency ?? "eur").toUpperCase(),
    status,
    reason: dispute.reason ?? null,
    evidence_due_by: dispute.evidence_details?.due_by
      ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
      : null,
  });

  if (insertError && insertError.code !== "23505") {
    Sentry.captureException(insertError, {
      extra: { context: "dispute.created_insert", dispute_id: dispute.id },
    });
  }

  if (!transaction) {
    Sentry.captureMessage(
      `dispute.created for unknown charge ${chargeId} (dispute ${dispute.id})`,
      { level: "warning" },
    );
    return;
  }

  // Lock the contested funds in the seller's wallet. The seller received
  // cardNet + shipping in finalizePaidTransaction, so we lock that same amount.
  // Since we don't have a dedicated locked column yet, we just decrement
  // pending_balance — the funds become un-payable until the dispute closes
  // (won → restore, lost → permanent debit via charge.refunded).
  const shippingTotal = Number(transaction.shipping_cost ?? 0);
  const disputedAmountEur = dispute.amount / 100;

  // How much of the disputed amount goes to shipping vs card?
  const shippingDisputed = Math.min(disputedAmountEur, shippingTotal);
  const cardAmountDisputed = Math.max(0, disputedAmountEur - shippingTotal);

  // Seller share to lock = card earnings portion + shipping portion
  const lockedShare = calcPriceSeller(cardAmountDisputed) + shippingDisputed;

  const { data: wallet } = await admin
    .from("wallets")
    .select("pending_balance")
    .eq("user_id", transaction.seller_id)
    .single();

  if (wallet) {
    const newPending = Math.max(
      0,
      Math.round((Number(wallet.pending_balance) - lockedShare) * 100) / 100,
    );
    await admin
      .from("wallets")
      .update({ pending_balance: newPending })
      .eq("user_id", transaction.seller_id);
  }

  // Mark the transaction as DISPUTED so it surfaces in the seller / admin UI.
  await admin
    .from("transactions")
    .update({ status: "DISPUTED" })
    .eq("id", transaction.id)
    .neq("status", "DISPUTED");

  // Alert admin (Sentry message ⇒ paged via Sentry alert rules; configure
  // a high-priority rule on level=warning + tag dispute=created).
  Sentry.captureMessage(
    `New chargeback opened: dispute=${dispute.id} amount=${dispute.amount / 100}€ tx=${transaction.id} reason=${dispute.reason}`,
    { level: "warning", tags: { kind: "stripe_dispute", action: "created" } },
  );

  // Notify the seller — they should know but cannot act directly (admin handles).
  sendPushNotification(
    transaction.seller_id,
    "Litige bancaire ouvert",
    "Un acheteur a contesté un paiement. Notre équipe traite le dossier.",
    `/orders/${transaction.id}`,
  ).catch((err) => Sentry.captureException(err));
}

/**
 * `charge.dispute.updated` — status / evidence_due_by may change. Just
 * sync our row.
 */
export async function handleChargeDisputeUpdated(
  dispute: Stripe.Dispute,
): Promise<void> {
  const admin = createAdminClient();
  const status = VALID_DISPUTE_STATUSES.has(dispute.status)
    ? dispute.status
    : "needs_response";

  const { error } = await admin
    .from("stripe_disputes")
    .update({
      status,
      evidence_due_by: dispute.evidence_details?.due_by
        ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
        : null,
    })
    .eq("stripe_dispute_id", dispute.id);

  if (error) {
    Sentry.captureException(error, {
      extra: { context: "dispute.updated", dispute_id: dispute.id },
    });
  }
}

/**
 * `charge.dispute.closed` — final outcome: won / lost / charge_refunded.
 *
 *   - won: restore the locked pending_balance (we successfully contested).
 *   - lost: pending_balance stays debited; mark transaction REFUNDED.
 *           The actual refund webhook (charge.refunded) will follow Stripe's
 *           accounting and we let it handle full-vs-partial debit logic.
 *   - charge_refunded: same as lost — we voluntarily refunded.
 */
export async function handleChargeDisputeClosed(
  dispute: Stripe.Dispute,
): Promise<void> {
  const admin = createAdminClient();
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;

  if (!RESOLVED_STATUSES.has(dispute.status)) {
    // Not actually closed; treat as updated.
    return handleChargeDisputeUpdated(dispute);
  }

  // Sync the dispute row first.
  await admin
    .from("stripe_disputes")
    .update({
      status: dispute.status,
      outcome: dispute.status,
      outcome_reason: dispute.reason ?? null,
    })
    .eq("stripe_dispute_id", dispute.id);

  const { data: transaction } = await admin
    .from("transactions")
    .select("id, seller_id, shipping_cost, total_amount")
    .eq("stripe_charge_id", chargeId)
    .maybeSingle();

  if (!transaction) {
    Sentry.captureMessage(
      `dispute.closed for unknown charge ${chargeId} (dispute ${dispute.id})`,
      { level: "warning" },
    );
    return;
  }

  if (dispute.status === "won" || dispute.status === "warning_closed") {
    // Restore the funds we locked in dispute.created (cardNet + shipping).
    const shippingTotal = Number(transaction.shipping_cost ?? 0);
    const disputedAmountEur = dispute.amount / 100;

    const shippingDisputed = Math.min(disputedAmountEur, shippingTotal);
    const cardAmountDisputed = Math.max(0, disputedAmountEur - shippingTotal);

    const restoredShare =
      calcPriceSeller(cardAmountDisputed) + shippingDisputed;

    const { data: wallet } = await admin
      .from("wallets")
      .select("pending_balance")
      .eq("user_id", transaction.seller_id)
      .single();
    if (wallet) {
      await admin
        .from("wallets")
        .update({
          pending_balance: round2(
            Number(wallet.pending_balance) + restoredShare,
          ),
        })
        .eq("user_id", transaction.seller_id);
    }

    // Restore the transaction status only if it was DISPUTED. If a refund
    // happened in parallel (status REFUNDED), keep the refund.
    await admin
      .from("transactions")
      .update({ status: "PAID" })
      .eq("id", transaction.id)
      .eq("status", "DISPUTED");

    sendPushNotification(
      transaction.seller_id,
      "Litige résolu en ta faveur",
      "Les fonds ont été restitués à ton portefeuille.",
      `/orders/${transaction.id}`,
    ).catch((err) => Sentry.captureException(err));
  } else {
    // lost / charge_refunded — no wallet action here, the charge.refunded
    // webhook will handle the actual debit. Just notify and surface.
    sendPushNotification(
      transaction.seller_id,
      "Litige perdu",
      "Le litige a été tranché en faveur de l'acheteur, le paiement est annulé.",
      `/orders/${transaction.id}`,
    ).catch((err) => Sentry.captureException(err));

    Sentry.captureMessage(
      `Dispute lost: ${dispute.id} amount=${dispute.amount / 100}€ tx=${transaction.id}`,
      { level: "warning", tags: { kind: "stripe_dispute", action: "lost" } },
    );
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
