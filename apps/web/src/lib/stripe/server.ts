import Stripe from "stripe";
import { getStripeEnv, STRIPE_API_VERSION } from "@/lib/env";

export type StripeService = "payments" | "connect" | "operations";

const clients: Partial<Record<StripeService, Stripe>> = {};

export function getStripe(service: StripeService = "payments"): Stripe {
  if (!clients[service]) {
    const env = getStripeEnv();
    const apiKey = {
      payments: env.paymentsApiKey,
      connect: env.connectApiKey,
      operations: env.operationsApiKey,
    }[service];

    clients[service] = new Stripe(apiKey, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
      appInfo: {
        name: `DeckDealr ${service}`,
      },
    });
  }
  return clients[service];
}
