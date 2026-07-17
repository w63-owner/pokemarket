import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

import { createMockDb } from "@/test-utils/db-mock";

const { sendPushNotification } = vi.hoisted(() => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/push/send", () => ({
  sendPushNotification,
}));

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

let mockClient: ReturnType<typeof createMockDb>["client"];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import { handlePayoutFailed } from "./payout";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handlePayoutFailed", () => {
  it("does not re-credit funds already transferred to the connected account", async () => {
    const db = createMockDb({
      wallets: [
        {
          user_id: "seller-1",
          available_balance: 20,
          pending_balance: 0,
        },
      ],
      payouts: [
        {
          id: "payout-record-1",
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
        amount: 5_000,
        metadata: {
          user_id: "seller-1",
          transfer_id: "tr_succeeded",
          payout_record_id: "payout-record-1",
        },
        failure_code: "account_closed",
        failure_message: "The bank account has been closed.",
      } as unknown as Stripe.Payout,
      "acct_seller_1",
    );

    // The €50 transfer remains in the connected account after the bank payout
    // fails. Only the seller's unrelated €20 of later earnings stays here.
    expect(db.state.wallets[0].available_balance).toBe(20);
    expect(db.state.payouts[0]).toMatchObject({
      status: "failed",
      failure_code: "account_closed",
      failure_message: "The bank account has been closed.",
    });
    expect(sendPushNotification).toHaveBeenCalledWith(
      "seller-1",
      "Virement échoué",
      expect.any(String),
      "/wallet",
    );
  });
});
