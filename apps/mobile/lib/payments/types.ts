import type { MobileCheckoutResponse } from "@pokemarket/shared";

export type PaymentResult =
  | { status: "succeeded"; transactionId: string }
  | { status: "cancelled"; transactionId: string }
  | { status: "failed"; transactionId: string; error: string };

export type PresentPaymentParams = {
  /** Buyer-facing display name shown in PaymentSheet on Android. */
  merchantDisplayName: string;
  /**
   * Stripe payload returned by `POST /api/checkout?client=mobile`.
   */
  intent: MobileCheckoutResponse;
};

/**
 * The Stripe payment client displays PaymentSheet and resolves when the user
 * finishes or cancels the flow.
 */
export type PaymentProviderClient = {
  present(params: PresentPaymentParams): Promise<PaymentResult>;
};
