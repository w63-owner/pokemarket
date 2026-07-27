/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  retrieveCharge: vi.fn(),
  sendPushNotification: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: mocks.maybeSingle,
      };
      return query;
    },
    rpc: mocks.rpc,
  }),
}));
vi.mock("@/lib/push/send", () => ({
  sendPushNotification: mocks.sendPushNotification,
}));
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({ charges: { retrieve: mocks.retrieveCharge } }),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { handleChargeRefunded, handleRefundUpdated } from "./charge-refunded";

describe("charge.refunded handler", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.retrieveCharge.mockReset();
    mocks.sendPushNotification.mockReset();
    mocks.sendPushNotification.mockResolvedValue(undefined);
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: "tx-1",
        buyer_id: "buyer-1",
        seller_id: "seller-1",
        total_amount: 112,
      },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [
        {
          transaction_id: "tx-1",
          seller_delta_minor: 2_381,
          applied_minor: 2_381,
          recovery_queued: false,
          debt_minor: 0,
        },
      ],
      error: null,
    });
  });

  it("delegates cumulative partial refunds to the atomic ledger RPC", async () => {
    await handleChargeRefunded({
      id: "ch_1",
      amount: 11_200,
      amount_refunded: 3_200,
      refunds: {
        data: [{ id: "re_2", status: "succeeded", created: 2 }],
      },
    } as any);

    expect(mocks.rpc).toHaveBeenCalledWith("apply_stripe_refund", {
      p_cumulative_refund_minor: 3_200,
      p_stripe_charge_id: "ch_1",
      p_stripe_refund_id: "re_2",
    });
  });

  it("throws on a ledger failure so Stripe redelivers the webhook", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "database unavailable" },
    });

    await expect(
      handleChargeRefunded({
        id: "ch_1",
        amount: 11_200,
        amount_refunded: 1_000,
      } as any),
    ).rejects.toMatchObject({ message: "database unavailable" });
  });

  it("reconciles a succeeded refund.updated event from its charge", async () => {
    mocks.retrieveCharge.mockResolvedValue({
      id: "ch_1",
      amount: 11_200,
      amount_refunded: 1_500,
      refunds: { data: [{ id: "re_1", status: "succeeded", created: 1 }] },
    });

    await handleRefundUpdated({
      id: "re_1",
      status: "succeeded",
      charge: "ch_1",
    } as any);

    expect(mocks.retrieveCharge).toHaveBeenCalledWith("ch_1", {
      expand: ["refunds"],
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_stripe_refund",
      expect.objectContaining({ p_cumulative_refund_minor: 1_500 }),
    );
  });
});
