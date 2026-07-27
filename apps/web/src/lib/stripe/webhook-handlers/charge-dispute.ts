import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
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

  const status = VALID_DISPUTE_STATUSES.has(dispute.status)
    ? dispute.status
    : "needs_response";
  const { error: insertError } = await admin.from("stripe_disputes").upsert(
    {
      stripe_dispute_id: dispute.id,
      stripe_charge_id: chargeId,
      transaction_id: transaction?.id ?? null,
      amount: dispute.amount / 100,
      amount_minor: dispute.amount,
      currency: (dispute.currency ?? "eur").toUpperCase(),
      status,
      reason: dispute.reason ?? null,
      evidence_due_by: evidenceDueBy(dispute),
      evidence_details: evidenceSummary(dispute),
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "stripe_dispute_id" },
  );
  if (insertError) throw insertError;

  if (!transaction) {
    Sentry.captureMessage(
      `dispute.created for unknown charge ${chargeId} (dispute ${dispute.id})`,
      { level: "warning" },
    );
    return;
  }

  const { error: lockError } = await admin.rpc("lock_stripe_dispute", {
    p_stripe_dispute_id: dispute.id,
  });
  if (lockError) throw lockError;

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
      amount: dispute.amount / 100,
      amount_minor: dispute.amount,
      evidence_due_by: evidenceDueBy(dispute),
      evidence_details: evidenceSummary(dispute),
      last_synced_at: new Date().toISOString(),
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

  const { error: syncError } = await admin
    .from("stripe_disputes")
    .update({
      status: dispute.status,
      outcome: dispute.status,
      outcome_reason: dispute.reason ?? null,
      amount: dispute.amount / 100,
      amount_minor: dispute.amount,
      evidence_due_by: evidenceDueBy(dispute),
      evidence_details: evidenceSummary(dispute),
      last_synced_at: new Date().toISOString(),
    })
    .eq("stripe_dispute_id", dispute.id);
  if (syncError) throw syncError;

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
    const { error: resolutionError } = await admin.rpc(
      "resolve_stripe_dispute",
      {
        p_stripe_dispute_id: dispute.id,
        p_outcome: dispute.status,
      },
    );
    if (resolutionError) throw resolutionError;

    sendPushNotification(
      transaction.seller_id,
      "Litige résolu en ta faveur",
      "Les fonds ont été restitués à ton portefeuille.",
      `/orders/${transaction.id}`,
    ).catch((err) => Sentry.captureException(err));
  } else {
    const { error: resolutionError } = await admin.rpc(
      "resolve_stripe_dispute",
      {
        p_stripe_dispute_id: dispute.id,
        p_outcome: dispute.status,
      },
    );
    if (resolutionError) throw resolutionError;

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

function evidenceDueBy(dispute: Stripe.Dispute): string | null {
  return dispute.evidence_details?.due_by
    ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
    : null;
}

function evidenceSummary(dispute: Stripe.Dispute) {
  return {
    has_evidence: dispute.evidence_details?.has_evidence ?? false,
    past_due: dispute.evidence_details?.past_due ?? false,
    submission_count: dispute.evidence_details?.submission_count ?? 0,
  };
}
