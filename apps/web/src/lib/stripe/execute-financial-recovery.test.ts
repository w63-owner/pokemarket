import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  createReversal: vi.fn(),
  createTransfer: vi.fn(),
  retrieveTransfer: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    transfers: {
      create: mocks.createTransfer,
      createReversal: mocks.createReversal,
      retrieve: mocks.retrieveTransfer,
    },
  }),
}));

import {
  executeFinancialRecovery,
  FinancialRecoveryBusyError,
} from "./execute-financial-recovery";

describe("executeFinancialRecovery", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.from.mockReset();
    mocks.createReversal.mockReset();
    mocks.createTransfer.mockReset();
    mocks.retrieveTransfer.mockReset();
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
    mocks.retrieveTransfer.mockResolvedValue({
      id: "tr_1",
      amount_reversed: 4_000,
    });

    await expect(executeFinancialRecovery("recovery-1")).resolves.toBe("trr_1");

    expect(mocks.createReversal).toHaveBeenCalledWith(
      "tr_1",
      expect.objectContaining({ amount: 3_000 }),
      { idempotencyKey: "transfer-reversal-recovery-1-4000" },
    );
    expect(mocks.rpc).toHaveBeenCalledWith("apply_stripe_transfer_reversal", {
      p_stripe_transfer_id: "tr_1",
      p_amount_reversed_minor: 4_000,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("complete_financial_recovery", {
      p_completed_amount_minor: 4_000,
      p_recovery_id: "recovery-1",
      p_stripe_object_id: "trr_1",
    });
  });

  it("applies Stripe cumulative amount_reversed for stacked recoveries", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: [
          {
            id: "recovery-dispute",
            transaction_id: "tx-1",
            seller_id: "seller-1",
            kind: "dispute",
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
    mocks.createReversal.mockResolvedValue({ id: "trr_2" });
    // Prior refund already reversed 4000; this dispute reverses 2500 more.
    mocks.retrieveTransfer.mockResolvedValue({
      id: "tr_1",
      amount_reversed: 6_500,
    });

    await expect(executeFinancialRecovery("recovery-dispute")).resolves.toBe(
      "trr_2",
    );

    expect(mocks.rpc).toHaveBeenCalledWith("apply_stripe_transfer_reversal", {
      p_stripe_transfer_id: "tr_1",
      p_amount_reversed_minor: 6_500,
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

  it("surfaces a busy error when another worker holds the recovery lease", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { status: "processing", stripe_transfer_id: "tr_1" },
            error: null,
          }),
        }),
      }),
    });

    await expect(executeFinancialRecovery("recovery-busy")).rejects.toBeInstanceOf(
      FinancialRecoveryBusyError,
    );
  });
});
