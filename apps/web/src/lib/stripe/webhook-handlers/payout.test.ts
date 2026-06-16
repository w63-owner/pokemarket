/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

const sendPushNotification = vi.fn().mockResolvedValue(undefined);

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

function failedPayout(metadata: Record<string, string> = {}) {
  return {
    id: "po_failed",
    amount: 10_000,
    metadata,
    failure_code: "account_closed",
    failure_message: "Bank account closed",
  } as any;
}

describe("handlePayoutFailed", () => {
  it("does not restore wallet balance when a platform transfer already funded the connected account", async () => {
    const db = createMockDb({
      wallets: [{ user_id: "seller-1", available_balance: 0 }],
      profiles: [{ id: "seller-1", stripe_account_id: "acct_seller" }],
      payouts: [
        {
          id: "payout-record-1",
          user_id: "seller-1",
          amount: 100,
          status: "in_transit",
          stripe_transfer_id: "tr_app_created",
          stripe_payout_id: "po_failed",
        },
      ],
    } as any);
    mockClient = db.client;

    await handlePayoutFailed(
      failedPayout({ user_id: "seller-1", transfer_id: "tr_app_created" }),
      "acct_seller",
    );

    expect(db.state.wallets[0].available_balance).toBe(0);
    expect((db.state as any).payouts[0].status).toBe("failed");
    expect((db.state as any).payouts[0].failure_code).toBe("account_closed");
    expect(sendPushNotification).toHaveBeenCalledWith(
      "seller-1",
      "Virement échoué",
      expect.any(String),
      "/wallet",
    );
  });

  it("restores legacy failed payouts that were not backed by an app platform transfer", async () => {
    const db = createMockDb({
      wallets: [{ user_id: "seller-1", available_balance: 15 }],
      profiles: [{ id: "seller-1", stripe_account_id: "acct_seller" }],
    });
    mockClient = db.client;

    await handlePayoutFailed(failedPayout({ user_id: "seller-1" }), null);

    expect(db.state.wallets[0].available_balance).toBe(115);
  });
});
