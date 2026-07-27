/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
}));

import { handleTransferCreated, handleTransferReversed } from "./transfer";

describe("transfer webhook handlers", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("persists a transfer.created replay with its order references", async () => {
    await handleTransferCreated({
      id: "tr_1",
      source_transaction: "ch_1",
      transfer_group: "order_tx-1",
      metadata: { transaction_id: "tx-1" },
    } as any);

    expect(mocks.rpc).toHaveBeenCalledWith("record_seller_transfer_success", {
      p_transaction_id: "tx-1",
      p_stripe_transfer_id: "tr_1",
      p_source_charge_id: "ch_1",
      p_transfer_group: "order_tx-1",
    });
  });

  it("records the cumulative reversed amount idempotently", async () => {
    await handleTransferReversed({
      id: "tr_1",
      amount_reversed: 4_500,
    } as any);

    expect(mocks.rpc).toHaveBeenCalledWith("apply_stripe_transfer_reversal", {
      p_amount_reversed_minor: 4_500,
      p_stripe_transfer_id: "tr_1",
    });
  });
});
