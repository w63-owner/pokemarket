/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  sendPushNotification: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: () => {
      throw new Error(
        "Fallback lookup should not run when metadata is present",
      );
    },
  }),
}));
vi.mock("@/lib/push/send", () => ({
  sendPushNotification: mocks.sendPushNotification,
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { handlePayoutFailed, handlePayoutPaid } from "./payout";

function payout(status: "failed" | "paid") {
  return {
    id: "po_1",
    amount: 4_500,
    status,
    failure_code: status === "failed" ? "bank_account_invalid" : null,
    failure_message: status === "failed" ? "Invalid bank account" : null,
    metadata: { user_id: "seller-1", payout_record_id: "payout-1" },
  } as any;
}

describe("payout webhook handlers", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.sendPushNotification.mockReset();
    mocks.sendPushNotification.mockResolvedValue(undefined);
  });

  it("delegates payout.failed to the atomic idempotent transition RPC", async () => {
    await handlePayoutFailed(payout("failed"), "acct_seller");

    expect(mocks.rpc).toHaveBeenCalledWith("apply_stripe_payout_transition", {
      p_stripe_payout_id: "po_1",
      p_target_status: "failed",
      p_failure_code: "bank_account_invalid",
      p_failure_message: "Invalid bank account",
    });
    expect(mocks.sendPushNotification).toHaveBeenCalledWith(
      "seller-1",
      "Virement échoué",
      expect.stringContaining("restent disponibles"),
      "/wallet",
    );
  });

  it("records payout.paid through the same convergent state machine", async () => {
    await handlePayoutPaid(payout("paid"), "acct_seller");

    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_stripe_payout_transition",
      expect.objectContaining({
        p_stripe_payout_id: "po_1",
        p_target_status: "paid",
      }),
    );
  });
});
