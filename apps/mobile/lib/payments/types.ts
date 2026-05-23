import type { MobileCheckoutResponse } from "@pokemarket/shared";

export type PaymentResult =
  | { status: "succeeded"; transactionId: string }
  | { status: "cancelled"; transactionId: string }
  | { status: "failed"; transactionId: string; error: string };

export type PresentPaymentParams = {
  /** Buyer-facing display name shown in PaymentSheet on Android. */
  merchantDisplayName: string;
  /**
   * Polymorphic payload returned by `POST /api/checkout?client=mobile` —
   * the abstraction layer dispatches on `provider` and forwards the rest.
   */
  intent: MobileCheckoutResponse;
};

/**
 * A payment provider exposes ONE method: `present(params)` displays whatever
 * native UI the provider needs (PaymentSheet for Stripe, WebBrowser for
 * MangoPay 3DS) and resolves once the user finishes (or cancels) the flow.
 */
export type PaymentProviderClient = {
  present(params: PresentPaymentParams): Promise<PaymentResult>;
};
