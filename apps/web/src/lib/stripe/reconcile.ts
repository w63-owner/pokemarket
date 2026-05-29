import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { finalizePaidTransaction } from "@/lib/stripe/post-payment";

export type ReconcileResult = "PAID" | "PENDING_PAYMENT" | "ALREADY_PROCESSED";

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
): Promise<ReconcileResult> {
  const admin = createAdminClient();

  const { data: transaction } = await admin
    .from("transactions")
    .select("id, status, stripe_checkout_session_id")
    .eq("id", transactionId)
    .single();

  if (!transaction) return "PENDING_PAYMENT";
  if (transaction.status !== "PENDING_PAYMENT") return "ALREADY_PROCESSED";
  if (
    transaction.stripe_checkout_session_id &&
    transaction.stripe_checkout_session_id !== stripeSessionId
  ) {
    return "PENDING_PAYMENT";
  }

  // Confirm the buyer actually paid before triggering side-effects.
  // Expand `payment_intent.latest_charge` so we get both IDs in a single
  // round-trip — saves us the second `paymentIntents.retrieve()` call
  // that the webhook path has to make.
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(stripeSessionId, {
    expand: ["payment_intent.latest_charge"],
  });
  if (session.payment_status !== "paid") return "PENDING_PAYMENT";
  if (session.metadata?.transaction_id !== transactionId) {
    return "PENDING_PAYMENT";
  }

  const paymentIntent =
    typeof session.payment_intent === "object" &&
    session.payment_intent !== null
      ? session.payment_intent
      : null;
  const paymentIntentId =
    paymentIntent?.id ??
    (typeof session.payment_intent === "string"
      ? session.payment_intent
      : null);
  const chargeId =
    typeof paymentIntent?.latest_charge === "string"
      ? paymentIntent.latest_charge
      : (paymentIntent?.latest_charge?.id ?? null);

  const result = await finalizePaidTransaction(transactionId, {
    paymentIntentId,
    chargeId,
  });
  if (result === "PAID" || result === "ALREADY_PROCESSED") return result;
  return "PENDING_PAYMENT";
}

/**
 * Mobile equivalent of `reconcileCheckoutSession`: verifies a Stripe
 * PaymentIntent (created by the mobile PaymentSheet flow) and finalises the
 * transaction if Stripe confirms the payment, regardless of webhook delivery.
 *
 * Required because the mobile flow uses direct PaymentIntents (not Checkout
 * Sessions), so the success-page Server Component reconcile we rely on for
 * web doesn't apply. Webhooks can lag (or, in local dev, never arrive at all
 * without `stripe listen`), leaving the buyer's transaction stuck on
 * PENDING_PAYMENT even though the charge succeeded.
 *
 * Safe to call concurrently with the `payment_intent.succeeded` webhook: the
 * shared `finalizePaidTransaction` helper guards the PENDING_PAYMENT → PAID
 * transition with an atomic UPDATE so side-effects (wallet credit, system
 * message, emails) run exactly once.
 */
export async function reconcilePaymentIntent(
  transactionId: string,
  stripePaymentIntentId: string,
): Promise<ReconcileResult> {
  const admin = createAdminClient();

  const { data: transaction } = await admin
    .from("transactions")
    .select("id, status, stripe_payment_intent_id")
    .eq("id", transactionId)
    .single();

  if (!transaction) return "PENDING_PAYMENT";
  if (transaction.status !== "PENDING_PAYMENT") return "ALREADY_PROCESSED";
  if (
    transaction.stripe_payment_intent_id &&
    transaction.stripe_payment_intent_id !== stripePaymentIntentId
  ) {
    return "PENDING_PAYMENT";
  }

  // Expand `latest_charge` so we get both IDs in a single round-trip — same
  // shape used by the webhook path for refund / dispute downstream lookups.
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(stripePaymentIntentId, {
    expand: ["latest_charge"],
  });

  if (intent.status !== "succeeded") return "PENDING_PAYMENT";
  if (intent.metadata?.transaction_id !== transactionId) {
    return "PENDING_PAYMENT";
  }

  const chargeId =
    typeof intent.latest_charge === "string"
      ? intent.latest_charge
      : (intent.latest_charge?.id ?? null);

  const result = await finalizePaidTransaction(transactionId, {
    paymentIntentId: intent.id,
    chargeId,
  });
  if (result === "PAID" || result === "ALREADY_PROCESSED") return result;
  return "PENDING_PAYMENT";
}
