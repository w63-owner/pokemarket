/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
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
}));

import { handlePayoutFailed } from "./payout";

function failedPayout(overrides: Record<string, unknown> = {}) {
  return {
    id: "po_failed_1",
    amount: 5000,
    metadata: { user_id: "seller-1" },
    failure_code: "account_closed",
    failure_message: "The bank account is closed.",
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handlePayoutFailed", () => {
  it("does not restore wallet after a connected-account payout fails following a successful transfer", async () => {
    const db = createMockDb({
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
          id: "payout-1",
          user_id: "seller-1",
          amount: 50,
          currency: "EUR",
          status: "in_transit",
          stripe_transfer_id: "tr_success_1",
          stripe_payout_id: "po_failed_1",
        },
      ],
    });
    mockClient = db.client;

    await handlePayoutFailed(failedPayout(), "acct_seller_1");

    expect(db.state.wallets[0].available_balance).toBe(0);
    expect(db.state.payouts[0].status).toBe("failed");
    expect(db.state.payouts[0].failure_code).toBe("account_closed");
    expect(db.state.payouts[0].completed_at).toBeTruthy();
  });

  it("keeps the legacy platform-payout restore path when no transfer moved funds", async () => {
    const db = createMockDb({
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
          id: "payout-1",
          user_id: "seller-1",
          amount: 50,
          currency: "EUR",
          status: "pending",
          stripe_transfer_id: null,
          stripe_payout_id: "po_failed_1",
        },
      ],
    });
    mockClient = db.client;

    await handlePayoutFailed(failedPayout(), null);

    expect(db.state.wallets[0].available_balance).toBe(50);
    expect(db.state.payouts[0].status).toBe("failed");
  });
});
