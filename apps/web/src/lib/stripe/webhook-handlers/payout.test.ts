/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

import { createMockDb } from "@/test-utils/db-mock";

let mockClient: any;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

vi.mock("@/lib/push/send", () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import { handlePayoutFailed, handlePayoutPaid } from "./payout";

beforeEach(() => {
  vi.clearAllMocks();
});

function stripePayout(overrides: Partial<Stripe.Payout> = {}): Stripe.Payout {
  return {
    id: "po_failed_1",
    object: "payout",
    amount: 5000,
    currency: "eur",
    metadata: {
      user_id: "seller-1",
      payout_record_id: "payout-1",
    },
    failure_code: "account_closed",
    failure_message: "Account closed",
    ...overrides,
  } as Stripe.Payout;
}

describe("Stripe payout webhook handlers", () => {
  it("marks failed connected-account payouts without restoring app wallet balance", async () => {
    const db = createMockDb({
      wallets: [
        {
          user_id: "seller-1",
          available_balance: 0,
          pending_balance: 0,
        },
      ],
      payouts: [
        {
          id: "payout-1",
          user_id: "seller-1",
          amount: 50,
          currency: "EUR",
          status: "in_transit",
          stripe_payout_id: "po_failed_1",
        },
      ],
    });
    mockClient = db.client;

    await handlePayoutFailed(stripePayout(), "acct_seller_1");

    expect(db.state.wallets[0].available_balance).toBe(0);
    expect(db.state.payouts[0].status).toBe("failed");
    expect(db.state.payouts[0].failure_code).toBe("account_closed");
    expect(db.state.payouts[0].failure_message).toBe("Account closed");
  });

  it("uses payout_record_id metadata when marking payouts paid", async () => {
    const db = createMockDb({
      payouts: [
        {
          id: "payout-1",
          user_id: "seller-1",
          amount: 50,
          currency: "EUR",
          status: "in_transit",
          stripe_payout_id: null,
        },
      ],
    });
    mockClient = db.client;

    await handlePayoutPaid(stripePayout({ id: "po_paid_1" }), "acct_seller_1");

    expect(db.state.payouts[0].status).toBe("paid");
    expect(db.state.payouts[0].completed_at).toEqual(expect.any(String));
  });
});
