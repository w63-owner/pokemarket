import Stripe from "stripe";
import { getStripeEnv, STRIPE_API_VERSION } from "@/lib/env";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const env = getStripeEnv();
    _stripe = new Stripe(env.secretKey, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
    });
  }
  return _stripe;
}
