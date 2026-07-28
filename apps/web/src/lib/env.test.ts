import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStripeEnv, getStripeLaunchPolicy, STRIPE_API_VERSION } from "./env";

const stripeEnvKeys = [
  "STRIPE_PAYMENTS_API_KEY",
  "STRIPE_CONNECT_API_KEY",
  "STRIPE_OPERATIONS_API_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_CONNECT_WEBHOOK_SECRET",
  "STRIPE_WEBHOOK_IP_ALLOWLIST",
  "SUPPORT_EMAIL",
  "CHECKOUT_ALLOWED_ORIGINS",
  "STRIPE_CHECKOUT_ENABLED",
  "STRIPE_SOFT_LAUNCH_MAX_AMOUNT_MINOR",
  "STRIPE_SOFT_LAUNCH_BUYER_IDS",
] as const;

describe("Stripe environment", () => {
  const original: Partial<Record<(typeof stripeEnvKeys)[number], string>> = {};

  beforeEach(() => {
    for (const key of stripeEnvKeys) {
      original[key] = process.env[key];
    }

    process.env.STRIPE_PAYMENTS_API_KEY = "rk_test_payments";
    process.env.STRIPE_CONNECT_API_KEY = "rk_test_connect";
    process.env.STRIPE_OPERATIONS_API_KEY = "rk_test_operations";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_placeholder";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_placeholder";
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_placeholder";
    process.env.SUPPORT_EMAIL = "support@example.com";
    delete process.env.CHECKOUT_ALLOWED_ORIGINS;
    delete process.env.STRIPE_CHECKOUT_ENABLED;
    delete process.env.STRIPE_SOFT_LAUNCH_MAX_AMOUNT_MINOR;
    delete process.env.STRIPE_SOFT_LAUNCH_BUYER_IDS;
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
      paymentsApiKey: "rk_test_payments",
      connectApiKey: "rk_test_connect",
      operationsApiKey: "rk_test_operations",
      publishableKey: "pk_test_placeholder",
      webhookSecret: "whsec_placeholder",
      connectWebhookSecret: "whsec_connect_placeholder",
      supportEmail: "support@example.com",
    });
    expect(STRIPE_API_VERSION).toBe("2026-06-24.dahlia");
  });

  it("rejects missing or malformed payment credentials", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_PAYMENTS_API_KEY = "sk_test_not_restricted";

    expect(() => getStripeEnv()).toThrow("Invalid Stripe environment");
  });

  it("parses the soft-launch gate, amount cap, and buyer cohort", () => {
    process.env.STRIPE_CHECKOUT_ENABLED = "true";
    process.env.STRIPE_SOFT_LAUNCH_MAX_AMOUNT_MINOR = "10000";
    process.env.STRIPE_SOFT_LAUNCH_BUYER_IDS = "buyer-1, buyer-2";

    const policy = getStripeLaunchPolicy();

    expect(policy.checkoutEnabled).toBe(true);
    expect(policy.maxAmountMinor).toBe(10_000);
    expect([...policy.allowedBuyerIds]).toEqual(["buyer-1", "buyer-2"]);
  });

  it("rejects malformed launch controls", () => {
    process.env.STRIPE_CHECKOUT_ENABLED = "yes";
    expect(() => getStripeLaunchPolicy()).toThrow(
      "STRIPE_CHECKOUT_ENABLED must be true or false",
    );

    process.env.STRIPE_CHECKOUT_ENABLED = "true";
    process.env.STRIPE_SOFT_LAUNCH_MAX_AMOUNT_MINOR = "10.5";
    expect(() => getStripeLaunchPolicy()).toThrow(
      "STRIPE_SOFT_LAUNCH_MAX_AMOUNT_MINOR must be a positive integer",
    );
  });
});
