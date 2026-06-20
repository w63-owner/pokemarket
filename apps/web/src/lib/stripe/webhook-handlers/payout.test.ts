/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

const { sendPushNotification } = vi.hoisted(() => ({
  sendPushNotification: vi.fn(async () => undefined),
}));

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
  sendPushNotification.mockClear();
});

describe("handlePayoutFailed", () => {
  it("marks the payout failed without restoring the platform wallet after a Connect transfer", async () => {
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
          id: "payout-row-1",
          user_id: "seller-1",
          amount: 50,
          currency: "EUR",
          status: "in_transit",
          stripe_transfer_id: "tr_123",
          stripe_payout_id: "po_failed",
        },
      ],
    } as any);
    mockClient = db.client;

    await handlePayoutFailed(
      {
        id: "po_failed",
        amount: 5000,
        metadata: { user_id: "seller-1" },
        failure_code: "account_closed",
        failure_message: "Account closed",
      } as any,
      "acct_seller_1",
    );

    expect(db.state.wallets[0].available_balance).toBe(0);
    expect((db.state as any).payouts[0]).toMatchObject({
      status: "failed",
      failure_code: "account_closed",
      failure_message: "Account closed",
    });
    expect(sendPushNotification).toHaveBeenCalledWith(
      "seller-1",
      "Virement échoué",
      expect.any(String),
      "/wallet",
    );
  });
});
