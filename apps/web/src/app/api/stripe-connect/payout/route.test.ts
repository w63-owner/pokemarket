/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockDb } from "@/test-utils/db-mock";

const mocks = vi.hoisted(() => ({
  accountsRetrieve: vi.fn(),
  executeReservedPayout: vi.fn(),
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    v2: { core: { accounts: { retrieve: mocks.accountsRetrieve } } },
  }),
}));
vi.mock("@/lib/stripe/execute-payout", () => ({
  executeReservedPayout: mocks.executeReservedPayout,
}));

let currentUser: { id: string; email?: string } | null = {
  id: "seller-1",
  email: "seller@example.com",
};
vi.mock("@/lib/auth/api", () => ({
  getRequestUser: vi.fn(async () => ({
    user: currentUser,
    source: "bearer" as const,
  })),
}));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(async () => null),
  payoutRateLimit: {} as any,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import { POST } from "./route";

beforeEach(() => {
  currentUser = { id: "seller-1", email: "seller@example.com" };
  mocks.accountsRetrieve.mockReset();
  mocks.accountsRetrieve.mockResolvedValue({
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: { status: "active", status_details: [] },
            payouts: { status: "active", status_details: [] },
          },
        },
      },
    },
  });
  mocks.executeReservedPayout.mockReset();
  mocks.executeReservedPayout.mockImplementation(async (payoutId: string) => ({
    id: `po_${payoutId}`,
    status: "pending",
  }));
});

function req() {
  return new Request("http://localhost/api/stripe-connect/payout", {
    method: "POST",
  });
}

function payoutScenario(amountMinor = 5_000) {
  return {
    profiles: [{ id: "seller-1", stripe_account_id: "acct_seller_1" }],
    wallets: [
      {
        user_id: "seller-1",
        available_balance: amountMinor / 100,
        currency: "EUR",
      },
    ],
    seller_transfers: [
      {
        id: "st-1",
        transaction_id: "tx-1",
        seller_id: "seller-1",
        amount_minor: amountMinor,
        amount_reversed_minor: 0,
        payout_reserved_minor: 0,
        paid_minor: 0,
        currency: "EUR",
        status: "transferred",
        transferred_at: "2026-07-01T00:00:00.000Z",
      },
    ],
    financial_payout_config: [
      {
        minimum_payout_minor: 1_000,
        risk_reserve_minor: 500,
        payout_delay_days: 2,
      },
    ],
  };
}

describe("payout — transfers and bank payout are separate", () => {
  it("durably reserves eligible transferred orders before creating a payout", async () => {
    const db = createMockDb(payoutScenario());
    mockClient = db.client;

    const response = await POST(req());

    expect(response.status).toBe(200);
    expect(db.state.payouts).toHaveLength(1);
    expect(db.state.payouts[0]).toMatchObject({
      amount_minor: 4_500,
      status: "pending",
    });
    expect(db.state.seller_transfers[0]).toMatchObject({
      status: "payout_pending",
      payout_reserved_minor: 4_500,
    });
    expect(db.state.wallets[0].available_balance).toBe(5);
    expect(mocks.executeReservedPayout).toHaveBeenCalledWith("payout-1");
  });

  it("enforces minimum payout and risk reserve before Stripe", async () => {
    const db = createMockDb(payoutScenario(1_200));
    mockClient = db.client;

    const response = await POST(req());

    expect(response.status).toBe(400);
    expect(db.state.payouts).toHaveLength(0);
    expect(db.state.wallets[0].available_balance).toBe(12);
    expect(mocks.executeReservedPayout).not.toHaveBeenCalled();
  });

  it("refuses an inactive transfer capability without reserving funds", async () => {
    mocks.accountsRetrieve.mockResolvedValueOnce({
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: {
                status: "restricted",
                status_details: [],
              },
              payouts: { status: "active", status_details: [] },
            },
          },
        },
      },
    });
    const db = createMockDb(payoutScenario());
    mockClient = db.client;

    const response = await POST(req());

    expect(response.status).toBe(400);
    expect(db.state.payouts).toHaveLength(0);
    expect(mocks.executeReservedPayout).not.toHaveBeenCalled();
  });

  it("serializes concurrent requests so only one reservation wins", async () => {
    const db = createMockDb(payoutScenario(), { serializeWrites: true });
    mockClient = db.client;

    const responses = await Promise.all([POST(req()), POST(req())]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 400,
    ]);
    expect(db.state.payouts).toHaveLength(1);
    expect(mocks.executeReservedPayout).toHaveBeenCalledTimes(1);
  });
});
