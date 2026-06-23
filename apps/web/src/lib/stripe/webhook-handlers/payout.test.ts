/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const sendPushNotification = vi.fn(async () => undefined);
vi.mock("@/lib/push/send", () => ({ sendPushNotification }));

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const payoutEq = vi.fn(async () => ({ error: null }));
const payoutUpdate = vi.fn(() => ({ eq: payoutEq }));
const fromSpy = vi.fn((table: string) => {
  if (table === "wallets") {
    throw new Error("payout.failed must not restore app wallet balance");
  }
  if (table === "payouts") {
    return { update: payoutUpdate };
  }
  throw new Error(`Unexpected table ${table}`);
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromSpy }),
}));

import { handlePayoutFailed } from "./payout";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handlePayoutFailed", () => {
  it("marks payout failed without re-crediting wallet after platform transfer succeeded", async () => {
    const payout = {
      id: "po_failed",
      amount: 5_000,
      failure_code: "account_closed",
      failure_message: "Bank account closed",
      metadata: { user_id: "seller-1", transfer_id: "tr_platform_to_connect" },
    } as unknown as Stripe.Payout;

    await handlePayoutFailed(payout, "acct_seller");

    expect(fromSpy).not.toHaveBeenCalledWith("wallets");
    expect(payoutUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        failure_code: "account_closed",
        failure_message: "Bank account closed",
      }),
    );
    expect(payoutEq).toHaveBeenCalledWith("stripe_payout_id", "po_failed");
    expect(sendPushNotification).toHaveBeenCalledWith(
      "seller-1",
      "Virement échoué",
      expect.stringContaining("support"),
      "/wallet",
    );
  });
});
