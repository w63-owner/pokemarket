import { useCallback, useState } from "react";
import { startCheckout } from "@/lib/api/checkout";
import { stripeProvider } from "./stripe-provider";
import { mangopayProvider } from "./mangopay-provider";
import type { PaymentProviderClient, PaymentResult } from "./types";
import type { CheckoutRequest } from "@pokemarket/shared";

export type { PaymentResult } from "./types";

const PROVIDERS: Record<"stripe" | "mangopay", PaymentProviderClient> = {
  stripe: stripeProvider,
  mangopay: mangopayProvider,
};

/**
 * Unified mobile payment hook. Hides the provider abstraction from screens:
 *
 *   const { startPayment, isProcessing } = usePayment();
 *   const result = await startPayment({ listing_id, ... });
 *
 * Internally:
 *   1. POST /api/checkout?client=mobile to get a `MobileCheckoutResponse`
 *   2. Look up the provider by its `provider` discriminator
 *   3. Call `provider.present(...)` (Stripe PaymentSheet or Mangopay 3DS)
 *   4. Return the unified `PaymentResult` (succeeded / cancelled / failed)
 *
 * The webhook (`payment_intent.succeeded` for Stripe, MangoPay PayIn for
 * MangoPay) is what actually transitions the transaction to PAID — the
 * client just routes the user to the success screen on `succeeded`.
 */
export function usePayment() {
  const [isProcessing, setIsProcessing] = useState(false);

  const startPayment = useCallback(
    async (input: CheckoutRequest): Promise<PaymentResult> => {
      setIsProcessing(true);
      try {
        const intent = await startCheckout(input);
        const provider = PROVIDERS[intent.provider];
        return await provider.present({
          merchantDisplayName: "PokeMarket",
          intent,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Erreur inattendue";
        return {
          status: "failed",
          transactionId: "",
          error: message,
        };
      } finally {
        setIsProcessing(false);
      }
    },
    [],
  );

  return { startPayment, isProcessing };
}
