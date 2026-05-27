import type {
  CheckoutRequest,
  MobileCheckoutResponse,
  Transaction,
} from "@pokemarket/shared";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { supabase } from "@/lib/supabase";
import { api } from "./client";

/**
 * Initiate the checkout flow from mobile. Returns the polymorphic
 * `MobileCheckoutResponse` that drives the right native payment provider
 * (Stripe PaymentSheet or MangoPay 3DS WebView).
 *
 * The `?client=mobile` query param tells the backend to skip the legacy
 * Checkout-Session redirect path and create a PaymentIntent (or MangoPay
 * card-direct payin) instead.
 */
export async function startCheckout(
  input: CheckoutRequest,
): Promise<MobileCheckoutResponse> {
  return api.post<MobileCheckoutResponse>("/api/checkout?client=mobile", input);
}

/**
 * Server-side reconcile fallback for the mobile success screen. The mobile
 * checkout uses direct PaymentIntents, so the `payment_intent.succeeded`
 * webhook is what flips the transaction to PAID. If the webhook is slow
 * (or, in local dev, not forwarded at all), this endpoint asks the server
 * to check Stripe directly and run the same finalize side-effects the
 * webhook would.
 *
 * Best-effort: errors are swallowed by the caller — the success page will
 * still poll the DB and eventually display the PAID state once the
 * webhook catches up.
 */
export async function reconcileMobileOrder(
  transactionId: string,
): Promise<{ status: string }> {
  return api.post<{ status: string }>(
    `/api/orders/${transactionId}/reconcile`,
    {},
  );
}

/**
 * Read the buyer's view of a transaction (for the success screen).
 * RLS allows the buyer to see their own transactions.
 */
export async function fetchTransactionForBuyer(
  transactionId: string,
): Promise<Transaction | null> {
  const userId = getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("buyer_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as Transaction | null) ?? null;
}
