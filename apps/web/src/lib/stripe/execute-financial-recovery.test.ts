import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createReversal: vi.fn(),
  createTransfer: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    transfers: {
      create: mocks.createTransfer,
      createReversal: mocks.createReversal,
    },
  }),
}));

import { executeFinancialRecovery } from "./execute-financial-recovery";

describe("executeFinancialRecovery", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.createReversal.mockReset();
    mocks.createTransfer.mockReset();
  });

  it("creates an idempotent partial transfer reversal and settles it", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: [
          {
            id: "recovery-1",
            transaction_id: "tx-1",
            seller_id: "seller-1",
            kind: "refund",
            target_amount_minor: 4_000,
            completed_amount_minor: 1_000,
            stripe_transfer_id: "tr_1",
            stripe_account_id: "acct_1",
            source_charge_id: "ch_1",
            stripe_dispute_id: null,
          },
        ],
        error: null,
      })
      .mockResolvedValue({ data: true, error: null });
    mocks.createReversal.mockResolvedValue({ id: "trr_1" });

    await expect(executeFinancialRecovery("recovery-1")).resolves.toBe("trr_1");

    expect(mocks.createReversal).toHaveBeenCalledWith(
      "tr_1",
      expect.objectContaining({ amount: 3_000 }),
      { idempotencyKey: "transfer-reversal-recovery-1-4000" },
    );
    expect(mocks.rpc).toHaveBeenCalledWith("complete_financial_recovery", {
      p_completed_amount_minor: 4_000,
      p_recovery_id: "recovery-1",
      p_stripe_object_id: "trr_1",
    });
  });

  it("retransfers funds after a won dispute", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: [
          {
            id: "recovery-2",
            transaction_id: "tx-1",
            seller_id: "seller-1",
            kind: "dispute_restore",
            target_amount_minor: 2_500,
            completed_amount_minor: 0,
            stripe_transfer_id: "tr_1",
            stripe_account_id: "acct_1",
            source_charge_id: "ch_1",
            stripe_dispute_id: "dp_1",
          },
        ],
        error: null,
      })
      .mockResolvedValue({ data: true, error: null });
    mocks.createTransfer.mockResolvedValue({ id: "tr_restore_1" });

    await expect(executeFinancialRecovery("recovery-2")).resolves.toBe(
      "tr_restore_1",
    );
    expect(mocks.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2_500,
        destination: "acct_1",
        source_transaction: "ch_1",
      }),
      { idempotencyKey: "dispute-restore-recovery-2" },
    );
  });
});
