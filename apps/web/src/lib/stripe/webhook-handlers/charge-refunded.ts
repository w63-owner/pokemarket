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
    throw txError;
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
  const alreadyRefunded = Number(transaction.refunded_amount ?? 0);
  const newDelta =
    Math.round((cumulativeRefundedEur - alreadyRefunded) * 100) / 100;

  if (newDelta <= 0) {
    // Replay or out-of-order delivery — no new refund to process.
    return;
  }

  const isFullyRefunded = (charge.amount_refunded ?? 0) >= (charge.amount ?? 0);

  // The seller was credited cardNet + shipping in finalizePaidTransaction.
  // On refund we must reverse that proportionally:
  //   - shippingRefunded: the shipping portion of the refund (passed through 1:1)
  //   - cardRefunded: the card portion → seller loses calcPriceSeller(cardRefunded)
  //
  // For full refunds: reverse everything (cardNet + shipping).
  // For partial refunds: we assume shipping is refunded first, then card.
  // Important: allocate only the *remaining* unrefunded shipping against this
  // delta — otherwise every subsequent partial refund re-treats shipping as
  // still fully available and under-debits the seller's card earnings.
  const shippingTotal = Number(transaction.shipping_cost ?? 0);
  const cardTotal = Number(transaction.total_amount ?? 0) - shippingTotal;
  const remainingShipping = Math.max(
    0,
    round2(shippingTotal - alreadyRefunded),
  );
  const alreadyCardRefunded = Math.max(
    0,
    round2(alreadyRefunded - shippingTotal),
  );
  const remainingCard = Math.max(0, round2(cardTotal - alreadyCardRefunded));

  const shippingRefunded = Math.min(newDelta, remainingShipping);
  const cardRefundedDelta = Math.max(
    0,
    Math.min(newDelta - shippingRefunded, remainingCard),
  );

  // Seller share to reverse = card earnings portion + shipping portion.
  // Guard calcPriceSeller(0): pricing floors at 0.01, which would invent a
  // phantom 1¢ debit on shipping-only refunds.
  const sellerShareToReverse =
    (cardRefundedDelta > 0 ? calcPriceSeller(cardRefundedDelta) : 0) +
    shippingRefunded;

  // Read the wallet, then debit pending first, then available.
  const { data: wallet, error: walletReadError } = await admin
    .from("wallets")
    .select("pending_balance, available_balance")
    .eq("user_id", transaction.seller_id)
    .single();

  if (walletReadError) {
    Sentry.captureException(walletReadError, {
      extra: {
        context: "charge.refunded_wallet_read",
        transaction_id: transaction.id,
      },
    });
    throw walletReadError;
  }

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
      // Throw so the webhook route releases the idempotency claim and Stripe
      // retries. Safe because refunded_amount has not been advanced yet.
      throw walletError;
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

  // Do not throw after a successful wallet debit: releasing the webhook
  // idempotency claim would re-run this handler and double-debit. Retry the
  // transaction update inline instead, then page on persistent failure.
  let txUpdateError: { message?: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await admin
      .from("transactions")
      .update(txUpdate)
      .eq("id", transaction.id);
    txUpdateError = error;
    if (!error) break;
  }

  if (txUpdateError) {
    Sentry.captureException(txUpdateError, {
      extra: {
        context: "charge.refunded_tx_update",
        transaction_id: transaction.id,
        wallet_debited: sellerShareToReverse,
        cumulative_refunded_eur: cumulativeRefundedEur,
      },
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
