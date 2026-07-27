/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockDb } from "@/test-utils/db-mock";

const accountCreate = vi.fn(async () => ({ id: "acct_v2_seller" }));
const accountLinkCreate = vi.fn(async () => ({
  url: "https://connect.stripe.test/onboard",
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    v2: {
      core: {
        accounts: { create: accountCreate },
        accountLinks: { create: accountLinkCreate },
      },
    },
  }),
}));
vi.mock("@/lib/auth/api", () => ({
  getRequestUser: vi.fn(async () => ({
    user: { id: "seller-1", email: "seller@example.com" },
    source: "bearer" as const,
  })),
}));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(async () => null),
  onboardRateLimit: {},
}));
vi.mock("@/lib/env", () => ({
  getAllowedCheckoutOrigin: () => "https://pokemarket.test",
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import { POST } from "./route";

function request(body: object) {
  return new Request("https://pokemarket.test/api/stripe-connect/onboard", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://pokemarket.test",
    },
    body: JSON.stringify(body),
  });
}

function profile(stripeAccountId: string | null = null) {
  return {
    profiles: [
      {
        id: "seller-1",
        username: "collector",
        country_code: "FR",
        kyc_status: "UNVERIFIED",
        stripe_account_id: stripeAccountId,
      },
    ],
  };
}

beforeEach(() => {
  accountCreate.mockClear();
  accountLinkCreate.mockClear();
});

describe("Stripe Connect Accounts v2 onboarding", () => {
  it("requires seller type and country before account creation", async () => {
    const db = createMockDb(profile());
    mockClient = db.client;

    const response = await POST(request({ client: "web" }));

    expect(response.status).toBe(422);
    expect(accountCreate).not.toHaveBeenCalled();
  });

  it("creates a professional recipient with deterministic idempotency", async () => {
    const db = createMockDb(profile());
    mockClient = db.client;

    const response = await POST(
      request({ client: "mobile", entity_type: "company", country: "be" }),
    );

    expect(response.status).toBe(200);
    expect(accountCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboard: "express",
        identity: { country: "BE", entity_type: "company" },
        defaults: expect.objectContaining({
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
        }),
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: { requested: true },
              },
            },
          },
        },
      }),
      { idempotencyKey: "connect-recipient-v2-seller-1" },
    );
    expect(accountLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        account: "acct_v2_seller",
        use_case: expect.objectContaining({
          account_onboarding: expect.objectContaining({
            return_url:
              "https://pokemarket.test/api/stripe-connect/mobile-redirect?target=return",
          }),
        }),
      }),
    );
    expect(db.state.profiles[0]).toMatchObject({
      stripe_account_id: "acct_v2_seller",
      country_code: "BE",
      kyc_status: "PENDING",
    });
  });

  it("renews a link without creating a second account", async () => {
    const db = createMockDb(profile("acct_existing"));
    mockClient = db.client;

    const response = await POST(request({ client: "web" }));

    expect(response.status).toBe(200);
    expect(accountCreate).not.toHaveBeenCalled();
    expect(accountLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct_existing" }),
    );
  });
});
