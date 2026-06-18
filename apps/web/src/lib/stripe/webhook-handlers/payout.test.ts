/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
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

describe("stripe payout webhook handlers", () => {
  it("marks payout.failed without restoring wallet balance after transfer succeeded", async () => {
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
          stripe_payout_id: "po_failed_1",
          failure_code: null,
          failure_message: null,
        },
      ],
    });
    mockClient = db.client;

    await handlePayoutFailed(
      {
        id: "po_failed_1",
        amount: 5000,
        failure_code: "account_closed",
        failure_message: "The bank account is closed.",
        metadata: { user_id: "seller-1" },
      } as unknown as Stripe.Payout,
      "acct_seller_1",
    );

    expect(db.state.wallets[0].available_balance).toBe(0);
    expect(db.state.payouts[0]).toMatchObject({
      status: "failed",
      failure_code: "account_closed",
      failure_message: "The bank account is closed.",
    });
  });
});
