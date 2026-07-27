/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  sendPushNotification: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: mocks.maybeSingle,
        upsert: mocks.upsert,
        update: (value: unknown) => {
          mocks.update(value);
          return query;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(resolve),
      };
      if (table === "stripe_disputes") {
        query.upsert = mocks.upsert;
      }
      return query;
    },
    rpc: mocks.rpc,
  }),
}));
vi.mock("@/lib/push/send", () => ({
  sendPushNotification: mocks.sendPushNotification,
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import {
  handleChargeDisputeClosed,
  handleChargeDisputeCreated,
} from "./charge-dispute";

function dispute(status = "needs_response") {
  return {
    id: "dp_1",
    charge: "ch_1",
    amount: 5_000,
    currency: "eur",
    status,
    reason: "product_not_received",
    evidence_details: {
      due_by: 1_800_000_000,
      has_evidence: false,
      past_due: false,
      submission_count: 0,
    },
  } as any;
}

describe("charge dispute handlers", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.upsert.mockReset();
    mocks.update.mockReset();
    mocks.sendPushNotification.mockReset();
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: "tx-1",
        seller_id: "seller-1",
        total_amount: 100,
        shipping_cost: 5,
        status: "COMPLETED",
      },
      error: null,
    });
    mocks.upsert.mockResolvedValue({ data: null, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.sendPushNotification.mockResolvedValue(undefined);
  });

  it("upserts Stripe state then atomically locks seller liability", async () => {
    await handleChargeDisputeCreated(dispute());

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_dispute_id: "dp_1",
        amount_minor: 5_000,
      }),
      { onConflict: "stripe_dispute_id" },
    );
    expect(mocks.rpc).toHaveBeenCalledWith("lock_stripe_dispute", {
      p_stripe_dispute_id: "dp_1",
    });
  });

  it("resolves won disputes through the ledger RPC", async () => {
    await handleChargeDisputeClosed(dispute("won"));

    expect(mocks.rpc).toHaveBeenCalledWith("resolve_stripe_dispute", {
      p_outcome: "won",
      p_stripe_dispute_id: "dp_1",
    });
  });
});
