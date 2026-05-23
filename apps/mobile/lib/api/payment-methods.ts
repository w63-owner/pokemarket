import { api } from "./client";

export type PaymentMethod = {
  id: string;
  type: string;
  brand: string | null;
  last4: string;
  exp_month: number | null;
  exp_year: number | null;
  is_default?: boolean;
};

export async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
  const data = await api.get<{ payment_methods: PaymentMethod[] }>(
    "/api/stripe/payment-methods",
  );
  return data.payment_methods;
}

/**
 * Create a Stripe SetupIntent to register a new card. Returns the
 * `client_secret` PaymentSheet uses to render and confirm the SetupIntent.
 * The `customer_id` is needed so PaymentSheet can hydrate any other saved
 * cards in the same session.
 */
export async function createSetupIntent(): Promise<{
  client_secret: string;
  customer_id: string;
}> {
  return api.post<{ client_secret: string; customer_id: string }>(
    "/api/stripe/payment-methods",
  );
}

export async function setDefaultPaymentMethod(
  paymentMethodId: string,
): Promise<void> {
  await api.patch<{ ok: boolean }>("/api/stripe/payment-methods", {
    payment_method_id: paymentMethodId,
  });
}

export async function deletePaymentMethod(
  paymentMethodId: string,
): Promise<void> {
  await api.delete<{ ok: boolean }>("/api/stripe/payment-methods", {
    searchParams: { id: paymentMethodId },
  });
}
