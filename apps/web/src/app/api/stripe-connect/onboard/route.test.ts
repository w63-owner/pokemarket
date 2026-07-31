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
 
const getAllowedCheckoutOriginMock: any = vi.fn(
  () => "https://pokemarket.test",
);
vi.mock("@/lib/env", () => ({
   
  getAllowedCheckoutOrigin: (origin: any) =>
    getAllowedCheckoutOriginMock(origin),
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

  it("creates an individual recipient and normalises country code to uppercase", async () => {
    const db = createMockDb(profile());
    mockClient = db.client;

    const response = await POST(
      request({ client: "web", entity_type: "individual", country: "fr" }),
    );

    expect(response.status).toBe(200);
    expect(accountCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: { country: "FR", entity_type: "individual" },
      }),
      expect.any(Object),
    );
    expect(db.state.profiles[0]).toMatchObject({
      stripe_account_id: "acct_v2_seller",
      country_code: "FR",
      kyc_status: "PENDING",
    });
  });

  it("uses mobile deep-link URLs (refresh = /wallet/refresh) when client is mobile", async () => {
    const db = createMockDb(profile("acct_mobile"));
    mockClient = db.client;

    const response = await POST(request({ client: "mobile" }));

    expect(response.status).toBe(200);
    expect(accountLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        use_case: expect.objectContaining({
          account_onboarding: expect.objectContaining({
            return_url:
              "https://pokemarket.test/api/stripe-connect/mobile-redirect?target=return",
            refresh_url:
              "https://pokemarket.test/api/stripe-connect/mobile-redirect?target=refresh",
          }),
        }),
      }),
    );
  });

  it("returns 403 when Origin is not allowed", async () => {
    getAllowedCheckoutOriginMock.mockReturnValueOnce(null);

    const db = createMockDb(profile());
    mockClient = db.client;

    const response = await POST(
      request({ client: "web", entity_type: "individual", country: "FR" }),
    );
    expect(response.status).toBe(403);
    expect(accountCreate).not.toHaveBeenCalled();
  });

  it("is idempotent when account already exists (Accounts v2 duplicate)", async () => {
    const db = createMockDb(profile("acct_v2_seller"));
    mockClient = db.client;

    await POST(request({ client: "web" }));
    await POST(request({ client: "web" }));

    expect(accountCreate).not.toHaveBeenCalled();
    expect(accountLinkCreate).toHaveBeenCalledTimes(2);
     
    expect((accountLinkCreate.mock.calls[0] as any[])[0].account).toBe(
      "acct_v2_seller",
    );
     
    expect((accountLinkCreate.mock.calls[1] as any[])[0].account).toBe(
      "acct_v2_seller",
    );
  });

  it("uses web return/refresh URLs when client is web", async () => {
    const db = createMockDb(profile("acct_web"));
    mockClient = db.client;

    const response = await POST(request({ client: "web" }));

    expect(response.status).toBe(200);
    expect(accountLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        use_case: expect.objectContaining({
          account_onboarding: expect.objectContaining({
            return_url: "https://pokemarket.test/wallet/return",
            refresh_url:
              "https://pokemarket.test/wallet?stripe_connect=refresh",
          }),
        }),
      }),
    );
  });
});
