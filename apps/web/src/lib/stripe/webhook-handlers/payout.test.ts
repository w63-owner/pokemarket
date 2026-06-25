/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";

import { createMockDb } from "@/test-utils/db-mock";

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

const sendPushNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/push/send", () => ({
  sendPushNotification: (...args: any[]) => sendPushNotification(...args),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import { handlePayoutFailed } from "./payout";

describe("stripe payout webhook handlers", () => {
  it("does not re-credit the app wallet when a connected-account bank payout fails", async () => {
    const db = createMockDb({
      profiles: [{ id: "seller-1", stripe_account_id: "acct_seller_1" }],
      wallets: [
        { user_id: "seller-1", available_balance: 12.34, currency: "eur" },
      ],
      payouts: [
        {
          id: "payout-row-1",
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
        failure_message: "Bank account closed",
      } as Stripe.Payout,
      "acct_seller_1",
    );

    expect(db.state.wallets[0].available_balance).toBe(12.34);
    expect(db.state.payouts[0]).toMatchObject({
      status: "failed",
      failure_code: "account_closed",
      failure_message: "Bank account closed",
    });
    expect(sendPushNotification).toHaveBeenCalledWith(
      "seller-1",
      expect.any(String),
      expect.any(String),
      "/wallet",
    );
  });
});
