import { afterEach, describe, expect, it, vi } from "vitest";

const { captureMessage } = vi.hoisted(() => ({
  captureMessage: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage }));

import { verifyStripeWebhookSource } from "./webhook-security";

describe("Stripe webhook IP defense", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    captureMessage.mockClear();
  });

  it("is bypassed for local development and Stripe CLI forwarding", () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = new Request("http://localhost/api/webhooks/stripe");

    expect(verifyStripeWebhookSource(request)).toBeNull();
  });

  it("accepts a production request forwarded by Vercel from Stripe", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_WEBHOOK_IP_ALLOWLIST", "3.18.12.63, 3.130.192.231");
    const request = new Request("https://example.com/api/webhooks/stripe", {
      headers: { "x-vercel-forwarded-for": "3.18.12.63" },
    });

    expect(verifyStripeWebhookSource(request)).toBeNull();
  });

  it("rejects a missing or unknown production source", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_WEBHOOK_IP_ALLOWLIST", "3.18.12.63");
    const request = new Request("https://example.com/api/webhooks/stripe", {
      headers: { "x-vercel-forwarded-for": "203.0.113.10" },
    });

    expect(verifyStripeWebhookSource(request)?.status).toBe(403);
    expect(captureMessage).toHaveBeenCalledOnce();
  });
});
