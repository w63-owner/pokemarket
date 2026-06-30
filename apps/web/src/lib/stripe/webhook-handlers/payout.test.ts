/* eslint-disable @typescript-eslint/no-explicit-any */
import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
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

describe("stripe payout webhook handlers", () => {
  it("does not restore app wallet when a connected-account bank payout fails", async () => {
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
          id: "payout-record-1",
          user_id: "seller-1",
          amount: 50,
          currency: "EUR",
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
        metadata: { user_id: "seller-1" },
        failure_code: "account_closed",
        failure_message: "The bank account is closed",
      } as unknown as Stripe.Payout,
      "acct_connected_1",
    );

    expect(db.state.wallets[0].available_balance).toBe(0);
    expect(db.state.payouts[0].status).toBe("failed");
    expect(db.state.payouts[0].failure_code).toBe("account_closed");
    expect(sendPushNotification).toHaveBeenCalledWith(
      "seller-1",
      "Virement échoué",
      expect.any(String),
      "/wallet",
    );
  });
});
