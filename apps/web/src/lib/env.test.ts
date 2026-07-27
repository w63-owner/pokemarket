import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStripeEnv, STRIPE_API_VERSION } from "./env";

const stripeEnvKeys = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_CONNECT_WEBHOOK_SECRET",
  "SUPPORT_EMAIL",
  "CHECKOUT_ALLOWED_ORIGINS",
] as const;

describe("Stripe environment", () => {
  const original: Partial<Record<(typeof stripeEnvKeys)[number], string>> = {};

  beforeEach(() => {
    for (const key of stripeEnvKeys) {
      original[key] = process.env[key];
    }

    process.env.STRIPE_SECRET_KEY = "rk_test_placeholder";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_placeholder";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_placeholder";
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_placeholder";
    process.env.SUPPORT_EMAIL = "support@example.com";
    delete process.env.CHECKOUT_ALLOWED_ORIGINS;
  });

  afterEach(() => {
    for (const key of stripeEnvKeys) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("returns the reviewed Stripe configuration", () => {
    expect(getStripeEnv()).toMatchObject({
      secretKey: "rk_test_placeholder",
      publishableKey: "pk_test_placeholder",
      webhookSecret: "whsec_placeholder",
      connectWebhookSecret: "whsec_connect_placeholder",
      supportEmail: "support@example.com",
    });
    expect(STRIPE_API_VERSION).toBe("2026-06-24.dahlia");
  });

  it("rejects missing or malformed payment credentials", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_SECRET_KEY = "not-a-stripe-key";

    expect(() => getStripeEnv()).toThrow("Invalid Stripe environment");
  });
});
