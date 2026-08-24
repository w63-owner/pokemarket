import { useCallback, useState } from "react";
import { startCheckout } from "@/lib/api/checkout";
import { stripeProvider } from "./stripe-provider";
import type { PaymentResult } from "./types";
import type { CheckoutRequest } from "@deckdealr/shared";

export type { PaymentResult } from "./types";

/**
 * Mobile Stripe PaymentSheet hook:
 *
 *   const { startPayment, isProcessing } = usePayment();
 *   const result = await startPayment({ listing_id, ... });
 *
 * Internally:
 *   1. POST /api/checkout?client=mobile to get a `MobileCheckoutResponse`
 *   2. Present Stripe PaymentSheet
 *   3. Return the unified `PaymentResult` (succeeded / cancelled / failed)
 *
 * The `payment_intent.succeeded` webhook is what actually transitions the
 * transaction to PAID; the client only routes to the success screen.
 */
export function usePayment() {
  const [isProcessing, setIsProcessing] = useState(false);

  const startPayment = useCallback(
    async (input: CheckoutRequest): Promise<PaymentResult> => {
      setIsProcessing(true);
      try {
        const intent = await startCheckout(input);
        return await stripeProvider.present({
          merchantDisplayName: "DeckDealr",
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
