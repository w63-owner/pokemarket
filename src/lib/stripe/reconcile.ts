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

  const result = await finalizePaidTransaction(transactionId);
  if (result === "PAID" || result === "ALREADY_PROCESSED") return result;
  return "PENDING_PAYMENT";
}
