/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let currentUser: { id: string; email?: string } | null = {
  id: "seller-1",
  email: "seller@example.com",
};

vi.mock("@/lib/auth/api", () => ({
  getRequestUser: vi.fn(async () => ({
    user: currentUser,
    source: currentUser ? ("bearer" as const) : null,
  })),
}));

const accountLinksCreate = vi.fn(async () => ({
  url: "https://connect.stripe.test/onboarding",
}));
const accountsCreate = vi.fn(async () => ({ id: "acct_created" }));

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    accounts: { create: accountsCreate },
    accountLinks: { create: accountLinksCreate },
  }),
}));

vi.mock("@/lib/env", () => ({
  getAppUrl: () => "https://pokemarket.test",
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(async () => null),
  onboardRateLimit: {} as any,
}));

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET } from "./route";

beforeEach(() => {
  currentUser = { id: "seller-1", email: "seller@example.com" };
  accountLinksCreate.mockClear();
  accountsCreate.mockClear();
  vi.clearAllMocks();
});

function req(url = "http://localhost/api/stripe-connect/onboard?client=mobile") {
  return new Request(url, {
    headers: { authorization: "Bearer jwt" },
  });
}

describe("stripe-connect/onboard", () => {
  it("rejects anonymous callers", async () => {
    currentUser = null;
    mockClient = createMockDb({}).client;

    const res = await GET(req());

    expect(res.status).toBe(401);
  });

  it("uses mobile deep links for bearer-authenticated mobile onboarding", async () => {
    mockClient = createMockDb({
      profiles: [
        {
          id: "seller-1",
          stripe_account_id: "acct_seller",
          kyc_status: "PENDING",
        },
      ],
    }).client;

    const res = await GET(req());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe("https://connect.stripe.test/onboarding");
    expect(accountLinksCreate).toHaveBeenCalledWith({
      account: "acct_seller",
      type: "account_onboarding",
      return_url: "pokemarket://wallet/return",
      refresh_url: "pokemarket://wallet",
    });
  });
});
