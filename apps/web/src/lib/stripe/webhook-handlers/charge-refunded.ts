import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push/send";
import { getStripe } from "@/lib/stripe/server";

export async function handleRefundUpdated(
  refund: Stripe.Refund,
): Promise<void> {
  if (refund.status !== "succeeded") return;

  const chargeId =
    typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
  if (!chargeId) {
    throw new Error(`Succeeded refund ${refund.id} has no charge`);
  }

  const charge = await getStripe().charges.retrieve(chargeId, {
    expand: ["refunds"],
  });
  await handleChargeRefunded(charge);
}

/**
 * Applies Stripe's cumulative refunded amount through one atomic ledger RPC.
 * The database computes the seller target before/after, locks pre-transfer
 * funds, queues a transfer reversal, or records seller debt after payout.
 */
export async function handleChargeRefunded(
  charge: Stripe.Charge,
): Promise<void> {
  const admin = createAdminClient();
  const cumulativeRefundedMinor = charge.amount_refunded ?? 0;
  if (cumulativeRefundedMinor <= 0) return;

  const { data: transaction, error: txError } = await admin
    .from("transactions")
    .select("id, buyer_id, seller_id, total_amount")
    .eq("stripe_charge_id", charge.id)
    .maybeSingle();

  if (txError) throw txError;
  if (!transaction) {
    Sentry.captureMessage(
      `charge.refunded webhook received for unknown charge ${charge.id}`,
      { level: "warning" },
    );
    return;
  }

  const latestRefund = charge.refunds?.data
    .filter((refund) => refund.status === "succeeded")
    .sort((a, b) => b.created - a.created)[0];
  const { data: result, error } = await admin.rpc("apply_stripe_refund", {
    p_stripe_charge_id: charge.id,
    p_cumulative_refund_minor: cumulativeRefundedMinor,
    p_stripe_refund_id: latestRefund?.id,
  });
  if (error) throw error;

  const applied = result?.[0];
  if (applied?.debt_minor && applied.debt_minor > 0) {
    Sentry.captureMessage(
      `Seller debt recorded after refund for transaction ${transaction.id}`,
      {
        level: "error",
        tags: { kind: "seller_debt", source: "refund" },
        extra: { debt_minor: applied.debt_minor, charge_id: charge.id },
      },
    );
  }

  const isFullyRefunded = cumulativeRefundedMinor >= (charge.amount ?? 0);
  const refundedEur = cumulativeRefundedMinor / 100;
  sendPushNotification(
    transaction.buyer_id,
    isFullyRefunded ? "Remboursement reçu" : "Remboursement partiel reçu",
    isFullyRefunded
      ? "Tes fonds reviendront sur ta carte sous 5-10 jours."
      : `${formatPrice(refundedEur)} a été remboursé au total.`,
    `/orders/${transaction.id}`,
  ).catch((err) => Sentry.captureException(err));

  sendPushNotification(
    transaction.seller_id,
    "Vente remboursée",
    isFullyRefunded
      ? "La vente a été annulée et les fonds restitués à l'acheteur."
      : `Les remboursements cumulés atteignent ${formatPrice(refundedEur)}.`,
    `/orders/${transaction.id}`,
  ).catch((err) => Sentry.captureException(err));
}

function formatPrice(n: number): string {
  return `${n.toFixed(2)} €`;
}
