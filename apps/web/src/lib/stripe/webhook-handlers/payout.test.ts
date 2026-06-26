/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

const sendPushNotification = vi.fn(async () => undefined);

vi.mock("@/lib/push/send", () => ({
  sendPushNotification,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("stripe payout webhook handlers", () => {
  it("payout.failed marks history failed without restoring app wallet balance", async () => {
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
          id: "payout-row-1",
          user_id: "seller-1",
          amount: 50,
          currency: "EUR",
          status: "in_transit",
          stripe_transfer_id: "tr_1",
          stripe_payout_id: "po_1",
        },
      ],
    } as any);
    mockClient = db.client;

    await handlePayoutFailed(
      {
        id: "po_1",
        amount: 5000,
        metadata: { user_id: "seller-1" },
        failure_code: "account_closed",
        failure_message: "Bank account closed",
      } as any,
      "acct_seller_1",
    );

    expect(db.state.wallets[0].available_balance).toBe(0);
    expect(db.state.payouts[0]).toMatchObject({
      status: "failed",
      failure_code: "account_closed",
      failure_message: "Bank account closed",
    });
    expect(sendPushNotification).toHaveBeenCalledWith(
      "seller-1",
      "Virement échoué",
      expect.any(String),
      "/wallet",
    );
  });
});
