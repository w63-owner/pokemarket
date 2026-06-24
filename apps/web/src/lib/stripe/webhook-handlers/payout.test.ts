/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

vi.mock("@/lib/push/send", () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { handlePayoutFailed } from "./payout";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("stripe payout webhook handlers", () => {
  it("does not restore wallet balance when a connected-account bank payout fails", async () => {
    const db = createMockDb({
      wallets: [{ user_id: "seller-1", available_balance: 0 }],
      payouts: [
        {
          id: "payout-row-1",
          user_id: "seller-1",
          amount: 50,
          status: "in_transit",
          stripe_payout_id: "po_failed",
        },
      ],
    });
    mockClient = db.client;

    await handlePayoutFailed(
      {
        id: "po_failed",
        amount: 5000,
        failure_code: "account_closed",
        failure_message: "The bank account is closed.",
        metadata: { user_id: "seller-1" },
      } as any,
      "acct_seller",
    );

    expect(db.state.wallets[0].available_balance).toBe(0);
    expect(db.state.payouts[0]).toMatchObject({
      status: "failed",
      failure_code: "account_closed",
      failure_message: "The bank account is closed.",
    });
    expect(db.state.payouts[0].completed_at).toEqual(expect.any(String));
  });
});
