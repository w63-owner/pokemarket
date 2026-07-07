/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
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

import { handlePayoutFailed } from "./payout";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("stripe payout webhook handlers", () => {
  it("payout.failed marks the payout failed without restoring platform wallet balance", async () => {
    const db = createMockDb({
      profiles: [{ id: "seller-1", stripe_account_id: "acct_seller_1" }],
      wallets: [
        {
          user_id: "seller-1",
          available_balance: 0,
          pending_balance: 0,
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
          stripe_payout_id: "po_1",
        },
      ],
    });
    mockClient = db.client;

    await handlePayoutFailed(
      {
        id: "po_1",
        amount: 5000,
        failure_code: "account_closed",
        failure_message: "Bank account closed",
        metadata: {
          user_id: "seller-1",
          transfer_id: "tr_1",
          payout_record_id: "payout-record-1",
        },
      } as any,
      "acct_seller_1",
    );

    expect(db.state.wallets[0].available_balance).toBe(0);
    expect(db.state.payouts[0]).toMatchObject({
      status: "failed",
      failure_code: "account_closed",
      failure_message: "Bank account closed",
    });
  });
});
