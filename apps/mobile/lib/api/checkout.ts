import type {
  CheckoutRequest,
  MobileCheckoutResponse,
  Transaction,
} from "@pokemarket/shared";
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
 * Read the buyer's view of a transaction (for the success screen).
 * RLS allows the buyer to see their own transactions.
 */
export async function fetchTransactionForBuyer(
  transactionId: string,
): Promise<Transaction | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("buyer_id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as Transaction | null) ?? null;
}
