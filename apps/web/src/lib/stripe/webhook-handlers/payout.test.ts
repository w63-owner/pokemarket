/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

vi.mock("@/lib/push/send", () => ({
  sendPushNotification: vi.fn(async () => undefined),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import { handlePayoutFailed } from "./payout";

describe("Stripe payout webhook handler", () => {
  it("does not restore app wallet after a connected-account bank payout fails", async () => {
    const db = createMockDb({
      profiles: [{ id: "seller-1", stripe_account_id: "acct_seller_1" }],
      wallets: [
        {
          user_id: "seller-1",
          available_balance: 0,
          pending_balance: 0,
          currency: "eur",
        },
      ],
      payouts: [
        {
          id: "payout-record-1",
          user_id: "seller-1",
          amount: 50,
          currency: "EUR",
          status: "in_transit",
          stripe_transfer_id: "tr_1",
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
        failure_message: "Bank account closed",
        metadata: { user_id: "seller-1" },
      } as any,
      "acct_seller_1",
    );

    expect(db.state.wallets[0].available_balance).toBe(0);
    expect(db.state.payouts[0].status).toBe("failed");
    expect(db.state.payouts[0].failure_code).toBe("account_closed");
    expect(db.callCounts["wallets.update"] ?? 0).toBe(0);
  });
});
