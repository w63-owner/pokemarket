import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";

import type { createAdminClient } from "@/lib/supabase/admin";
import { calcPriceSeller } from "@/lib/pricing";
import { deriveKycStatus } from "@/lib/stripe/kyc";
import { sendPushNotification } from "@/lib/push/send";
import type { KycStatus } from "@/lib/constants";

type AdminClient = ReturnType<typeof createAdminClient>;

// ---------------------------------------------------------------------------
// account.updated  (Stripe Connect KYC changes)
// ---------------------------------------------------------------------------

/**
 * Sync the seller's local kyc_status with Stripe whenever Stripe pushes
 * an account.updated event. This eliminates the need for the wallet UI to
 * poll /api/stripe-connect/status on every render.
 *
 * Best-effort by design: the write is gated by the previous status to
 * avoid no-op UPDATEs and to avoid race conditions with the manual sync
 * endpoint. We notify the seller only on the PENDING/REQUIRED → VERIFIED
 * transition (i.e. "you can now withdraw your money").
 */
export async function handleAccountUpdated(
  account: Stripe.Account,
  admin: AdminClient,
): Promise<void> {
  const accountId = account.id;
  if (!accountId) return;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, kyc_status")
    .eq("stripe_account_id", accountId)
    .maybeSingle();

  if (profileError) {
    Sentry.captureException(profileError);
    throw profileError;
  }
  if (!profile) {
    // Stripe sometimes emits account.updated for accounts created via the
    // dashboard before our DB knew about them — silently ignore.
    console.warn(
      `[stripe-webhook] account.updated for unknown account ${accountId}`,
    );
    return;
  }

  const newStatus: KycStatus = deriveKycStatus(account);
  const previousStatus = (profile.kyc_status ?? "UNVERIFIED") as KycStatus;

  if (previousStatus === newStatus) return;

  const { error: updateError } = await admin
    .from("profiles")
    .update({ kyc_status: newStatus })
    .eq("id", profile.id);

  if (updateError) {
    Sentry.captureException(updateError);
    throw updateError;
  }

  if (previousStatus !== "VERIFIED" && newStatus === "VERIFIED") {
    sendPushNotification(
      profile.id,
      "Identité vérifiée !",
      "Tu peux maintenant retirer tes gains depuis ton portefeuille.",
      "/wallet",
    ).catch((err) => Sentry.captureException(err));
  }
}

// ---------------------------------------------------------------------------
// charge.refunded  (full or partial refunds)
// ---------------------------------------------------------------------------

/**
 * Mirror a refund issued through Stripe (either by us via the admin route,
 * or by Stripe in response to a lost dispute) into our local ledger.
 *
 * Money flow recap:
 *   • The refund is debited from our platform balance immediately by Stripe.
 *   • We mirror this by reducing the seller's wallet balances. Pending
 *     balance is consumed first (most recent sales haven't been released
 *     yet); any remaining shortfall is taken from available_balance and,
 *     in the worst case, leaves available_balance at 0 with a residual
 *     debt that we log for manual reconciliation.
 *
 * Idempotency: charge.refunded fires once per refund event, but Stripe may
 * redeliver. The outer webhook route already gates by event_id, so we can
 * rely on per-event uniqueness here. We additionally compare the cumulative
 * refunded_amount against the persisted column to short-circuit no-ops.
 */
export async function handleChargeRefunded(
  charge: Stripe.Charge,
  admin: AdminClient,
): Promise<void> {
  if (!charge.id) return;

  const { data: transaction, error: txError } = await admin
    .from("transactions")
    .select("id, seller_id, total_amount, shipping_cost, refunded_amount")
    .eq("stripe_charge_id", charge.id)
    .maybeSingle();

  if (txError) {
    Sentry.captureException(txError);
    throw txError;
  }
  if (!transaction) {
    console.warn(
      `[stripe-webhook] charge.refunded for unknown charge ${charge.id}`,
    );
    return;
  }

  const totalRefunded = (charge.amount_refunded ?? 0) / 100;
  const previousRefunded = Number(transaction.refunded_amount ?? 0);
  const incrementalRefund =
    Math.round((totalRefunded - previousRefunded) * 100) / 100;

  if (incrementalRefund <= 0) return;

  const totalAmount = Number(transaction.total_amount);
  const isFullyRefunded = totalRefunded >= totalAmount - 0.005;

  const txPatch: Record<string, unknown> = {
    refunded_amount: totalRefunded,
    refunded_at: new Date().toISOString(),
  };
  if (isFullyRefunded) txPatch.status = "REFUNDED";

  const { error: txUpdateError } = await admin
    .from("transactions")
    .update(txPatch)
    .eq("id", transaction.id);
  if (txUpdateError) {
    Sentry.captureException(txUpdateError);
    throw txUpdateError;
  }

  // Translate the buyer-facing refund into the seller's net loss using the
  // same fee formula we used when crediting them on payment.
  const shippingCost = Number(transaction.shipping_cost ?? 0);
  const refundedDisplayPortion = Math.max(0, incrementalRefund - shippingCost);
  const sellerDebit = calcPriceSeller(refundedDisplayPortion);

  if (sellerDebit > 0) {
    await debitWallet(admin, transaction.seller_id, sellerDebit);
  }
}

/**
 * Subtract `amount` from the seller's wallet, preferring pending_balance
 * (unreleased sales) and falling back to available_balance.
 *
 * If the wallet doesn't have enough on either bucket, we floor at 0 and
 * record a Sentry breadcrumb — the unrecovered amount becomes a debt the
 * platform needs to recover off-band (next sale, manual collection, etc.).
 * A future ledger-based wallet would model this with a proper signed
 * `negative_balance` column.
 */
async function debitWallet(
  admin: AdminClient,
  userId: string,
  amount: number,
): Promise<void> {
  const { data: wallet, error: walletReadError } = await admin
    .from("wallets")
    .select("pending_balance, available_balance")
    .eq("user_id", userId)
    .single();

  if (walletReadError) {
    Sentry.captureException(walletReadError);
    throw walletReadError;
  }

  const pending = Number(wallet?.pending_balance ?? 0);
  const available = Number(wallet?.available_balance ?? 0);

  let remaining = amount;
  let nextPending = pending;
  let nextAvailable = available;

  const fromPending = Math.min(pending, remaining);
  nextPending = round2(pending - fromPending);
  remaining = round2(remaining - fromPending);

  if (remaining > 0) {
    const fromAvailable = Math.min(available, remaining);
    nextAvailable = round2(available - fromAvailable);
    remaining = round2(remaining - fromAvailable);
  }

  if (remaining > 0) {
    Sentry.captureMessage(
      `[stripe-webhook] Seller wallet underwater after refund debit`,
      {
        level: "warning",
        extra: {
          user_id: userId,
          amount_owed: remaining,
          original_debit: amount,
        },
      },
    );
    console.warn(
      `[stripe-webhook] Wallet underwater for user ${userId}: ${remaining} EUR uncovered`,
    );
  }

  const { error: walletWriteError } = await admin
    .from("wallets")
    .update({
      pending_balance: nextPending,
      available_balance: nextAvailable,
    })
    .eq("user_id", userId);

  if (walletWriteError) {
    Sentry.captureException(walletWriteError);
    throw walletWriteError;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// charge.dispute.created / .updated / .closed  (chargebacks)
// ---------------------------------------------------------------------------

/**
 * A buyer raised a chargeback with their bank. Stripe immediately freezes
 * the funds on our platform balance and gives us an `evidence_due_by`
 * deadline. We mirror that in DB (stripe_disputes table), flag the
 * underlying transaction as DISPUTED, lock the seller's pending balance,
 * and alert the admin team.
 */
export async function handleDisputeCreated(
  dispute: Stripe.Dispute,
  admin: AdminClient,
): Promise<void> {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return;

  const { data: transaction } = await admin
    .from("transactions")
    .select("id, seller_id, total_amount, shipping_cost, status")
    .eq("stripe_charge_id", chargeId)
    .maybeSingle();

  const transactionId = transaction?.id ?? null;

  await admin.from("stripe_disputes").insert({
    stripe_dispute_id: dispute.id,
    stripe_charge_id: chargeId,
    transaction_id: transactionId,
    amount: (dispute.amount ?? 0) / 100,
    currency: dispute.currency ?? "eur",
    reason: dispute.reason ?? "unknown",
    status: dispute.status,
    evidence_due_by: dispute.evidence_details?.due_by
      ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
      : null,
  });

  if (transaction) {
    await admin
      .from("transactions")
      .update({ status: "DISPUTED" })
      .eq("id", transaction.id)
      .neq("status", "REFUNDED");

    // Lock the seller's exposure to this transaction by debiting pending
    // balance only (don't touch available — that money is provably theirs
    // from past sales). Same pattern as refunds but without writing
    // refunded_amount, since the funds are still at Stripe pending the
    // dispute outcome.
    const shippingCost = Number(transaction.shipping_cost ?? 0);
    const sellerExposure = calcPriceSeller(
      Math.max(0, Number(transaction.total_amount) - shippingCost),
    );
    if (sellerExposure > 0) {
      await debitWallet(admin, transaction.seller_id, sellerExposure);
    }
  }

  Sentry.captureMessage(
    `[stripe-webhook] Chargeback opened (dispute ${dispute.id})`,
    {
      level: "warning",
      extra: {
        stripe_dispute_id: dispute.id,
        amount_eur: (dispute.amount ?? 0) / 100,
        reason: dispute.reason,
        evidence_due_by: dispute.evidence_details?.due_by,
        transaction_id: transactionId,
      },
    },
  );
}

/**
 * Stripe pushes charge.dispute.updated for status / evidence changes
 * before the dispute is finally closed. We just mirror the row.
 */
export async function handleDisputeUpdated(
  dispute: Stripe.Dispute,
  admin: AdminClient,
): Promise<void> {
  const patch: Record<string, unknown> = {
    status: dispute.status,
  };
  if (dispute.evidence_details?.due_by) {
    patch.evidence_due_by = new Date(
      dispute.evidence_details.due_by * 1000,
    ).toISOString();
  }
  if (dispute.evidence_details?.submission_count) {
    patch.evidence_submitted_at = new Date().toISOString();
  }

  await admin
    .from("stripe_disputes")
    .update(patch)
    .eq("stripe_dispute_id", dispute.id);
}

/**
 * Final outcome of a chargeback. Two cases:
 *   - won           : the seller wins, restore their pending balance.
 *   - lost / closed : Stripe will (or has already) refund the buyer; the
 *                     wallet stays debited and the transaction lands on
 *                     REFUNDED via the parallel charge.refunded event.
 */
export async function handleDisputeClosed(
  dispute: Stripe.Dispute,
  admin: AdminClient,
): Promise<void> {
  const outcome =
    dispute.status === "won"
      ? "won"
      : dispute.status === "lost"
        ? "lost"
        : (dispute.status ?? null);

  await admin
    .from("stripe_disputes")
    .update({
      status: dispute.status,
      outcome,
    })
    .eq("stripe_dispute_id", dispute.id);

  if (dispute.status !== "won") return;

  // Won — restore the seller's pending balance that we locked on creation.
  const { data: row } = await admin
    .from("stripe_disputes")
    .select("transaction_id")
    .eq("stripe_dispute_id", dispute.id)
    .maybeSingle();

  if (!row?.transaction_id) return;

  const { data: transaction } = await admin
    .from("transactions")
    .select("seller_id, total_amount, shipping_cost")
    .eq("id", row.transaction_id)
    .maybeSingle();

  if (!transaction) return;

  const shippingCost = Number(transaction.shipping_cost ?? 0);
  const sellerNet = calcPriceSeller(
    Math.max(0, Number(transaction.total_amount) - shippingCost),
  );

  if (sellerNet > 0) {
    await creditWallet(admin, transaction.seller_id, sellerNet);
  }

  await admin
    .from("transactions")
    .update({ status: "PAID" })
    .eq("id", row.transaction_id)
    .eq("status", "DISPUTED");
}

async function creditWallet(
  admin: AdminClient,
  userId: string,
  amount: number,
): Promise<void> {
  const { data: wallet } = await admin
    .from("wallets")
    .select("pending_balance")
    .eq("user_id", userId)
    .single();

  const newPending = round2(Number(wallet?.pending_balance ?? 0) + amount);
  await admin
    .from("wallets")
    .update({ pending_balance: newPending })
    .eq("user_id", userId);
}

// ---------------------------------------------------------------------------
// payout.failed / payout.paid  (transfers to seller IBAN)
// ---------------------------------------------------------------------------

/**
 * The transfer to the seller's bank failed (invalid IBAN, closed account,
 * etc.). The funds came back to the connected account's Stripe balance,
 * but we already debited their wallet when initiating the payout, so we
 * have to credit it back.
 *
 * The original payout amount lives in `payout.amount` (in cents). We
 * identify the user via metadata.user_id, which we set when creating the
 * payout in /api/stripe-connect/payout/route.ts.
 */
export async function handlePayoutFailed(
  payout: Stripe.Payout,
  admin: AdminClient,
): Promise<void> {
  const userId = payout.metadata?.user_id;
  if (!userId) {
    console.warn(
      `[stripe-webhook] payout.failed without user_id metadata (${payout.id})`,
    );
    return;
  }

  const amount = (payout.amount ?? 0) / 100;
  if (amount <= 0) return;

  const { data: wallet } = await admin
    .from("wallets")
    .select("available_balance")
    .eq("user_id", userId)
    .single();

  const newAvailable = round2(Number(wallet?.available_balance ?? 0) + amount);
  await admin
    .from("wallets")
    .update({ available_balance: newAvailable })
    .eq("user_id", userId);

  Sentry.captureMessage(`[stripe-webhook] payout.failed for user ${userId}`, {
    level: "warning",
    extra: {
      stripe_payout_id: payout.id,
      amount_eur: amount,
      failure_code: payout.failure_code,
      failure_message: payout.failure_message,
    },
  });

  sendPushNotification(
    userId,
    "Virement échoué",
    "Vérifie ton IBAN dans ton portefeuille — ton argent t'attend.",
    "/wallet",
  ).catch((err) => Sentry.captureException(err));
}

/**
 * Confirmation that the funds have actually landed in the seller's bank.
 * Pure notification — the wallet was already debited at payout time.
 */
export async function handlePayoutPaid(payout: Stripe.Payout): Promise<void> {
  const userId = payout.metadata?.user_id;
  if (!userId) return;

  const amount = (payout.amount ?? 0) / 100;

  sendPushNotification(
    userId,
    "Virement reçu",
    `${amount.toFixed(2)} € viennent d'arriver sur ton compte bancaire.`,
    "/wallet",
  ).catch((err) => Sentry.captureException(err));
}
