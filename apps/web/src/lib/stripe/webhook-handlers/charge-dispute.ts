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

/** Statuses we may restore to after a won dispute. */
const RESTORABLE_TX_STATUSES = new Set([
  "PAID",
  "SHIPPED",
  "COMPLETED",
  "DELIVERED",
]);

/**
 * `charge.dispute.created` — a chargeback was opened by the issuing bank.
 *
 * Critical action items:
 *   1. INSERT a row in stripe_disputes (idempotent via UNIQUE stripe_dispute_id).
 *   2. Lock the seller's contested funds across pending AND available balances
 *      (COMPLETED orders have already moved escrow to available).
 *   3. Persist previous transaction status + lock split so won disputes can
 *      restore the correct buckets / lifecycle state.
 *   4. Update the transaction status to DISPUTED.
 *   5. Alert admin urgently (deadline can be as short as 7 days).
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
  // Leave previous_transaction_status NULL so the first successful claimer
  // owns the wallet lock (CAS below).
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
    previous_transaction_status: null,
    locked_from_pending: 0,
    locked_from_available: 0,
    funds_restored: false,
  });

  if (insertError && insertError.code !== "23505") {
    Sentry.captureException(insertError, {
      extra: { context: "dispute.created_insert", dispute_id: dispute.id },
    });
    throw insertError;
  }

  if (!transaction) {
    Sentry.captureMessage(
      `dispute.created for unknown charge ${chargeId} (dispute ${dispute.id})`,
      { level: "warning" },
    );
    return;
  }

  // Claim ownership of the wallet lock. Only the first claimer (or a crash
  // recovery where locks were never recorded) should debit the wallet.
  const { data: claimed, error: claimError } = await admin
    .from("stripe_disputes")
    .update({ previous_transaction_status: transaction.status })
    .eq("stripe_dispute_id", dispute.id)
    .is("previous_transaction_status", null)
    .select(
      "stripe_dispute_id, locked_from_pending, locked_from_available, previous_transaction_status",
    );

  if (claimError) {
    Sentry.captureException(claimError, {
      extra: { context: "dispute.created_claim", dispute_id: dispute.id },
    });
    throw claimError;
  }

  const claimedRow = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!claimedRow) {
    const { data: existing } = await admin
      .from("stripe_disputes")
      .select(
        "locked_from_pending, locked_from_available, previous_transaction_status",
      )
      .eq("stripe_dispute_id", dispute.id)
      .maybeSingle();

    const locksApplied =
      Number(existing?.locked_from_pending ?? 0) +
        Number(existing?.locked_from_available ?? 0) >
      0;

    if (locksApplied || transaction.status === "DISPUTED") {
      // Prior attempt finished (or mostly finished). Ensure DISPUTED and exit
      // without touching the wallet again.
      if (transaction.status !== "DISPUTED") {
        await admin
          .from("transactions")
          .update({ status: "DISPUTED" })
          .eq("id", transaction.id)
          .neq("status", "DISPUTED");
      }
      return;
    }

    // previous_status was claimed but locks were never written and the tx is
    // not DISPUTED yet — continue into the lock path for crash recovery.
  }

  // Lock the contested funds in the seller's wallet. The seller received
  // cardNet + shipping in finalizePaidTransaction. After escrow release those
  // funds live in available_balance, so we must debit pending first, then
  // available — otherwise COMPLETED chargebacks lock nothing.
  const shippingTotal = Number(transaction.shipping_cost ?? 0);
  const disputedAmountEur = dispute.amount / 100;

  // How much of the disputed amount goes to shipping vs card?
  const shippingDisputed = Math.min(disputedAmountEur, shippingTotal);
  const cardAmountDisputed = Math.max(0, disputedAmountEur - shippingTotal);

  // Seller share to lock = card earnings portion + shipping portion.
  // Guard calcPriceSeller(0): pricing floors at 0.01.
  const lockedShare =
    (cardAmountDisputed > 0 ? calcPriceSeller(cardAmountDisputed) : 0) +
    shippingDisputed;

  const { data: wallet, error: walletReadError } = await admin
    .from("wallets")
    .select("pending_balance, available_balance")
    .eq("user_id", transaction.seller_id)
    .single();

  if (walletReadError) {
    Sentry.captureException(walletReadError, {
      extra: {
        context: "dispute.created_wallet_read",
        dispute_id: dispute.id,
        transaction_id: transaction.id,
      },
    });
    // Release the claim so a later retry can re-enter cleanly.
    await admin
      .from("stripe_disputes")
      .update({ previous_transaction_status: null })
      .eq("stripe_dispute_id", dispute.id)
      .eq("locked_from_pending", 0)
      .eq("locked_from_available", 0);
    throw walletReadError;
  }

  let lockedFromPending = 0;
  let lockedFromAvailable = 0;

  if (wallet) {
    let pending = Number(wallet.pending_balance ?? 0);
    let available = Number(wallet.available_balance ?? 0);
    let remaining = lockedShare;

    lockedFromPending = Math.min(remaining, pending);
    remaining -= lockedFromPending;
    pending -= lockedFromPending;

    lockedFromAvailable = Math.min(remaining, available);
    remaining -= lockedFromAvailable;
    available -= lockedFromAvailable;

    const { error: walletError } = await admin
      .from("wallets")
      .update({
        pending_balance: round2(pending),
        available_balance: round2(available),
      })
      .eq("user_id", transaction.seller_id);

    if (walletError) {
      Sentry.captureException(walletError, {
        extra: {
          context: "dispute.created_wallet_lock",
          dispute_id: dispute.id,
          transaction_id: transaction.id,
          locked_share: lockedShare,
        },
      });
      await admin
        .from("stripe_disputes")
        .update({ previous_transaction_status: null })
        .eq("stripe_dispute_id", dispute.id)
        .eq("locked_from_pending", 0)
        .eq("locked_from_available", 0);
      throw walletError;
    }

    if (remaining > 0) {
      Sentry.captureMessage(
        `Dispute ${dispute.id} could not fully lock ${lockedShare}€ for tx ${transaction.id}: ${remaining}€ already withdrawn`,
        { level: "error" },
      );
    }
  }

  // Persist the lock split. After a successful wallet debit we must not throw
  // in a way that clears webhook idempotency — that would double-debit.
  let lockMetaError: { message?: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await admin
      .from("stripe_disputes")
      .update({
        previous_transaction_status: transaction.status,
        locked_from_pending: round2(lockedFromPending),
        locked_from_available: round2(lockedFromAvailable),
      })
      .eq("stripe_dispute_id", dispute.id);
    lockMetaError = error;
    if (!error) break;
  }

  if (lockMetaError) {
    Sentry.captureException(lockMetaError, {
      extra: {
        context: "dispute.created_lock_meta",
        dispute_id: dispute.id,
        transaction_id: transaction.id,
        locked_from_pending: lockedFromPending,
        locked_from_available: lockedFromAvailable,
      },
    });
  }

  // Mark the transaction as DISPUTED so it surfaces in the seller / admin UI.
  let txStatusError: { message?: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await admin
      .from("transactions")
      .update({ status: "DISPUTED" })
      .eq("id", transaction.id)
      .neq("status", "DISPUTED");
    txStatusError = error;
    if (!error) break;
  }

  if (txStatusError) {
    Sentry.captureException(txStatusError, {
      extra: {
        context: "dispute.created_tx_status",
        dispute_id: dispute.id,
        transaction_id: transaction.id,
      },
    });
  }

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
    throw error;
  }
}

/**
 * `charge.dispute.closed` — final outcome: won / lost / charge_refunded.
 *
 *   - won: restore the locked pending/available balances (we successfully
 *          contested) and return the transaction to its pre-dispute status.
 *   - lost: locked balances stay debited; mark transaction REFUNDED.
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
  const { error: closeMetaError } = await admin
    .from("stripe_disputes")
    .update({
      status: dispute.status,
      outcome: dispute.status,
      outcome_reason: dispute.reason ?? null,
    })
    .eq("stripe_dispute_id", dispute.id);

  if (closeMetaError) {
    Sentry.captureException(closeMetaError, {
      extra: { context: "dispute.closed_meta", dispute_id: dispute.id },
    });
    throw closeMetaError;
  }

  const { data: disputeRow, error: disputeReadError } = await admin
    .from("stripe_disputes")
    .select(
      "locked_from_pending, locked_from_available, previous_transaction_status",
    )
    .eq("stripe_dispute_id", dispute.id)
    .maybeSingle();

  if (disputeReadError) {
    Sentry.captureException(disputeReadError, {
      extra: { context: "dispute.closed_row_read", dispute_id: dispute.id },
    });
    throw disputeReadError;
  }

  const { data: transaction } = await admin
    .from("transactions")
    .select("id, seller_id, shipping_cost, total_amount, status")
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
    // Restore only what we actually locked. Fall back to the legacy
    // shipping-first formula when lock metadata is missing (pre-migration
    // rows), but never invent a credit larger than that formula.
    const shippingTotal = Number(transaction.shipping_cost ?? 0);
    const disputedAmountEur = dispute.amount / 100;
    const shippingDisputed = Math.min(disputedAmountEur, shippingTotal);
    const cardAmountDisputed = Math.max(0, disputedAmountEur - shippingTotal);
    const legacyShare =
      (cardAmountDisputed > 0 ? calcPriceSeller(cardAmountDisputed) : 0) +
      shippingDisputed;

    const lockedFromPending = Number(disputeRow?.locked_from_pending ?? 0);
    const lockedFromAvailable = Number(disputeRow?.locked_from_available ?? 0);
    const hasLockMeta = lockedFromPending > 0 || lockedFromAvailable > 0;

    // Claim the restore so concurrent/retried closed events cannot mint
    // a second wallet credit.
    const { data: restoreClaim, error: restoreClaimError } = await admin
      .from("stripe_disputes")
      .update({ funds_restored: true })
      .eq("stripe_dispute_id", dispute.id)
      .eq("funds_restored", false)
      .select(
        "locked_from_pending, locked_from_available, previous_transaction_status",
      );

    if (restoreClaimError) {
      Sentry.captureException(restoreClaimError, {
        extra: {
          context: "dispute.closed_restore_claim",
          dispute_id: dispute.id,
        },
      });
      throw restoreClaimError;
    }

    const claimedRestore = Array.isArray(restoreClaim)
      ? restoreClaim[0]
      : restoreClaim;
    if (!claimedRestore) {
      // Already restored on a prior delivery.
      if (transaction.status === "DISPUTED") {
        const previousStatus = disputeRow?.previous_transaction_status;
        const restoreStatus =
          typeof previousStatus === "string" &&
          RESTORABLE_TX_STATUSES.has(previousStatus)
            ? previousStatus
            : "PAID";
        await admin
          .from("transactions")
          .update({ status: restoreStatus })
          .eq("id", transaction.id)
          .eq("status", "DISPUTED");
      }
      return;
    }

    const { data: wallet, error: walletReadError } = await admin
      .from("wallets")
      .select("pending_balance, available_balance")
      .eq("user_id", transaction.seller_id)
      .single();

    if (walletReadError) {
      // Release the restore claim so Stripe retry can re-enter.
      await admin
        .from("stripe_disputes")
        .update({ funds_restored: false })
        .eq("stripe_dispute_id", dispute.id);
      Sentry.captureException(walletReadError, {
        extra: {
          context: "dispute.closed_wallet_read",
          dispute_id: dispute.id,
          transaction_id: transaction.id,
        },
      });
      throw walletReadError;
    }

    if (wallet) {
      const pendingRestore = hasLockMeta ? lockedFromPending : legacyShare;
      const availableRestore = hasLockMeta ? lockedFromAvailable : 0;

      const { error: walletError } = await admin
        .from("wallets")
        .update({
          pending_balance: round2(
            Number(wallet.pending_balance) + pendingRestore,
          ),
          available_balance: round2(
            Number(wallet.available_balance) + availableRestore,
          ),
        })
        .eq("user_id", transaction.seller_id);

      if (walletError) {
        await admin
          .from("stripe_disputes")
          .update({ funds_restored: false })
          .eq("stripe_dispute_id", dispute.id);
        Sentry.captureException(walletError, {
          extra: {
            context: "dispute.closed_wallet_restore",
            dispute_id: dispute.id,
            transaction_id: transaction.id,
          },
        });
        throw walletError;
      }
    }

    // Restore the pre-dispute lifecycle status. Never force COMPLETED → PAID
    // (that reopens escrow incorrectly and leaves available funds stranded
    // relative to status). Fall back to PAID only when prior status is unknown.
    const previousStatus = disputeRow?.previous_transaction_status;
    const restoreStatus =
      typeof previousStatus === "string" &&
      RESTORABLE_TX_STATUSES.has(previousStatus)
        ? previousStatus
        : "PAID";

    // After wallet restore, do not throw on status update failure (would
    // re-credit on retry once funds_restored is true — we keep the claim).
    let txStatusError: { message?: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await admin
        .from("transactions")
        .update({ status: restoreStatus })
        .eq("id", transaction.id)
        .eq("status", "DISPUTED");
      txStatusError = error;
      if (!error) break;
    }

    if (txStatusError) {
      Sentry.captureException(txStatusError, {
        extra: {
          context: "dispute.closed_tx_restore",
          dispute_id: dispute.id,
          transaction_id: transaction.id,
          restore_status: restoreStatus,
        },
      });
    }

    sendPushNotification(
      transaction.seller_id,
      "Litige résolu en ta faveur",
      "Les fonds ont été restitués à ton portefeuille.",
      `/orders/${transaction.id}`,
    ).catch((err) => Sentry.captureException(err));
  } else {
    // lost / charge_refunded — no wallet action here, the charge.refunded
    // webhook will handle the actual debit. Just notify and surface.
    // NOTE: funds were already locked (debited) on dispute.created, so
    // charge.refunded should see a lower wallet and may alert for
    // unrecoverable remainder if the seller withdrew before the lock.
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
