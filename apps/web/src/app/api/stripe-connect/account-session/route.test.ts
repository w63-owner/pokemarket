import { describe, it, expect, vi, beforeEach } from "vitest";

const accountSessionsCreate = vi.fn(async () => ({
  client_secret: "acss_test_secret_xyz",
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    accountSessions: { create: accountSessionsCreate },
  }),
}));
vi.mock("@/lib/auth/api", () => ({
  getRequestUser: vi.fn(async () => ({
    user: { id: "seller-1", email: "seller@example.com" },
    source: "bearer" as const,
  })),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

let mockAdmin: {
  from: ReturnType<typeof vi.fn>;
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdmin,
}));

import { POST } from "./route";
import { getRequestUser } from "@/lib/auth/api";

function makeReq() {
  return new Request(
    "https://pokemarket.test/api/stripe-connect/account-session",
    { method: "POST" },
  );
}

function profileMock(stripeAccountId: string | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: stripeAccountId
              ? { stripe_account_id: stripeAccountId }
              : { stripe_account_id: null },
            error: null,
          }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  accountSessionsCreate.mockClear();
  vi.mocked(getRequestUser).mockResolvedValue({
    user: { id: "seller-1", email: "seller@example.com" },
    source: "bearer" as const,
  });
});

describe("POST /api/stripe-connect/account-session", () => {
  it("returns client_secret for a seller with a connected account", async () => {
    mockAdmin = profileMock("acct_test_123");

    const res = await POST(makeReq());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.client_secret).toBe("acss_test_secret_xyz");
    expect(accountSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct_test_123" }),
    );
  });

  it("returns 401 when the user is not authenticated", async () => {
    vi.mocked(getRequestUser).mockResolvedValueOnce({
      user: null,
      source: null,
    });
    mockAdmin = profileMock(null);

    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(accountSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 409 when no Stripe account has been created yet", async () => {
    mockAdmin = profileMock(null);

    const res = await POST(makeReq());
    expect(res.status).toBe(409);
    expect(accountSessionsCreate).not.toHaveBeenCalled();
  });

  it("enables all required embedded components", async () => {
    mockAdmin = profileMock("acct_test_456");

    await POST(makeReq());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (accountSessionsCreate.mock.calls as any[][])[0]?.[0];
    expect(call.components).toMatchObject({
      account_onboarding: { enabled: true },
      notification_banner: { enabled: true },
      account_management: { enabled: true },
      payouts: { enabled: true },
    });
  });
});
