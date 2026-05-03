import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { finalizePaidTransaction } from "@/lib/stripe/post-payment";

/**
 * Verify a Stripe checkout session and complete the payment flow if the
 * webhook hasn't processed it yet. Safe to call multiple times — the shared
 * `finalizePaidTransaction` helper guards the PENDING_PAYMENT → PAID
 * transition with an atomic UPDATE.
 *
 * Returns the reconciled transaction status.
 */
export async function reconcileCheckoutSession(
  transactionId: string,
  stripeSessionId: string,
): Promise<"PAID" | "PENDING_PAYMENT" | "ALREADY_PROCESSED"> {
  const admin = createAdminClient();

  const { data: transaction } = await admin
    .from("transactions")
    .select("id, status")
    .eq("id", transactionId)
    .single();

  if (!transaction) return "PENDING_PAYMENT";
  if (transaction.status !== "PENDING_PAYMENT") return "ALREADY_PROCESSED";

  // Confirm the buyer actually paid before triggering side-effects.
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
  if (session.payment_status !== "paid") return "PENDING_PAYMENT";

  // Capture the payment_intent + charge IDs so refund / dispute webhooks can
  // map back to this transaction.  See the webhook route for the full rationale.
  const paymentIntent = session.payment_intent;
  let paymentIntentId: string | null = null;
  let chargeId: string | null = null;

  if (typeof paymentIntent === "string") {
    paymentIntentId = paymentIntent;
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntent);
      const lc = pi.latest_charge;
      chargeId = typeof lc === "string" ? lc : (lc?.id ?? null);
    } catch {
      // Best-effort — losing the charge_id only impacts refund/dispute
      // attribution, never the buyer's confirmation flow.
    }
  } else if (paymentIntent && typeof paymentIntent === "object") {
    paymentIntentId = paymentIntent.id;
    const lc = paymentIntent.latest_charge;
    chargeId = typeof lc === "string" ? lc : (lc?.id ?? null);
  }

  const result = await finalizePaidTransaction(transactionId, {
    payment_intent_id: paymentIntentId,
    charge_id: chargeId,
  });
  if (result === "PAID" || result === "ALREADY_PROCESSED") return result;
  return "PENDING_PAYMENT";
}
