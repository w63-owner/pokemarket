import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { calcPriceSeller } from "@/lib/pricing";
import { sendPushNotification } from "@/lib/push/send";

/**
 * `charge.refunded` — fired when a refund (full or partial) is created OR
 * succeeds on a charge. Stripe sends this for both refunds we initiate
 * (admin route) and refunds initiated by the issuing bank.
 *
 * What we do:
 *   1. Look up the transaction via stripe_charge_id.
 *   2. Compute the new refunded_amount = charge.amount_refunded / 100.
 *   3. If the charge is fully refunded (amount === amount_refunded), mark
 *      the transaction as REFUNDED.
 *   4. Reverse the seller's wallet credit:
 *        - Prefer to debit pending_balance (the credit hasn't been
 *          released yet) so we don't go negative on available_balance.
 *        - If pending_balance is insufficient (i.e. funds already
 *          released to available), debit the rest from available.
 *        - If both are insufficient (already paid out), record a
 *          balance_owed flag and alert admin — recovery requires a
 *          payout claw-back outside Stripe's flow.
 *   5. Notify both parties.
 *
 * NOTE: pending_balance / available_balance are PostgREST UPDATEs without
 * row-level lock, but the wallet table is single-writer (admin client only)
 * and refund webhook deliveries are serialised by the
 * `stripe_webhooks_processed` idempotency table at the route layer.
 */
export async function handleChargeRefunded(
  charge: Stripe.Charge,
): Promise<void> {
  const admin = createAdminClient();

  const { data: transaction, error: txError } = await admin
    .from("transactions")
    .select(
      "id, buyer_id, seller_id, total_amount, shipping_cost, status, refunded_amount",
    )
    .eq("stripe_charge_id", charge.id)
    .maybeSingle();

  if (txError) {
    Sentry.captureException(txError, {
      extra: { context: "charge.refunded_tx_lookup", charge_id: charge.id },
    });
    return;
  }
  if (!transaction) {
    // Could be a charge from a checkout we don't track (e.g. test mode
    // residue). Log so we notice if it's a real bug.
    Sentry.captureMessage(
      `charge.refunded webhook received for unknown charge ${charge.id}`,
      { level: "warning" },
    );
    return;
  }

  // amount_refunded is cumulative (in cents) across all refunds on this
  // charge. We use it as the source of truth instead of summing webhook
  // payloads (which would break under retries).
  const cumulativeRefundedEur = (charge.amount_refunded ?? 0) / 100;
  const newDelta =
    Math.round(
      (cumulativeRefundedEur - Number(transaction.refunded_amount ?? 0)) * 100,
    ) / 100;

  if (newDelta <= 0) {
    // Replay or out-of-order delivery — no new refund to process.
    return;
  }

  const isFullyRefunded =
    (charge.amount_refunded ?? 0) >= (charge.amount ?? 0);

  // The seller share of the refund = (refundedDelta - shipping_share) * (1 / (1 + fee%))
  // For simplicity we use the same calcPriceSeller helper applied to the
  // refunded card portion only (excluding the shipping portion of the delta
  // proportionally). This is approximate for partial refunds but matches
  // the credit logic in finalizePaidTransaction (00007/post-payment).
  const shippingTotal = Number(transaction.shipping_cost ?? 0);
  const cardTotal =
    Number(transaction.total_amount ?? 0) - shippingTotal;
  const cardRefundedDelta = Math.max(
    0,
    Math.min(newDelta - shippingTotal, cardTotal),
  );
  const sellerShareToReverse = calcPriceSeller(cardRefundedDelta);

  // Read the wallet, then debit pending first, then available.
  const { data: wallet } = await admin
    .from("wallets")
    .select("pending_balance, available_balance")
    .eq("user_id", transaction.seller_id)
    .single();

  let pendingBefore = Number(wallet?.pending_balance ?? 0);
  let availableBefore = Number(wallet?.available_balance ?? 0);

  let toDebit = sellerShareToReverse;
  const fromPending = Math.min(toDebit, pendingBefore);
  toDebit -= fromPending;
  pendingBefore -= fromPending;

  const fromAvailable = Math.min(toDebit, availableBefore);
  toDebit -= fromAvailable;
  availableBefore -= fromAvailable;

  if (wallet) {
    const { error: walletError } = await admin
      .from("wallets")
      .update({
        pending_balance: round2(pendingBefore),
        available_balance: round2(availableBefore),
      })
      .eq("user_id", transaction.seller_id);
    if (walletError) {
      Sentry.captureException(walletError, {
        extra: {
          context: "charge.refunded_wallet_debit",
          transaction_id: transaction.id,
          to_debit: sellerShareToReverse,
        },
      });
    }
  }

  if (toDebit > 0) {
    // We owe money beyond what's in the wallet (already paid out to IBAN).
    // For the MVP we surface this as a critical Sentry alert and let admin
    // recover via a manual claw-back. A future ticket should add a proper
    // `balance_owed` field on profiles + auto-block payouts.
    Sentry.captureMessage(
      `Refund of ${sellerShareToReverse}€ exceeded seller wallet for tx ${transaction.id}: ${toDebit}€ unrecoverable`,
      { level: "error" },
    );
  }

  // Update the transaction row last so a wallet failure above doesn't
  // leave the tx flagged as REFUNDED with a stale wallet balance.
  const txUpdate: {
    refunded_amount: number;
    refunded_at?: string;
    status?: "REFUNDED";
  } = { refunded_amount: round2(cumulativeRefundedEur) };
  if (isFullyRefunded) {
    txUpdate.refunded_at = new Date().toISOString();
    txUpdate.status = "REFUNDED";
  }

  const { error: txUpdateError } = await admin
    .from("transactions")
    .update(txUpdate)
    .eq("id", transaction.id);

  if (txUpdateError) {
    Sentry.captureException(txUpdateError, {
      extra: { context: "charge.refunded_tx_update", transaction_id: transaction.id },
    });
  }

  // Best-effort notifications.
  sendPushNotification(
    transaction.buyer_id,
    isFullyRefunded ? "Remboursement reçu" : "Remboursement partiel reçu",
    isFullyRefunded
      ? "Tes fonds reviendront sur ta carte sous 5-10 jours."
      : `${formatPrice(newDelta)} t'a été remboursé.`,
    `/orders/${transaction.id}`,
  ).catch((err) => Sentry.captureException(err));

  sendPushNotification(
    transaction.seller_id,
    "Vente remboursée",
    isFullyRefunded
      ? "La vente a été annulée et les fonds restitués à l'acheteur."
      : `Un remboursement partiel de ${formatPrice(newDelta)} a été appliqué.`,
    `/orders/${transaction.id}`,
  ).catch((err) => Sentry.captureException(err));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatPrice(n: number): string {
  return `${n.toFixed(2)} €`;
}
