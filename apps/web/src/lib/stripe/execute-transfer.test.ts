/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockDb } from "@/test-utils/db-mock";

const mocks = vi.hoisted(() => ({
  transfersCreate: vi.fn(),
}));
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({ transfers: { create: mocks.transfersCreate } }),
}));

let client: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => client,
}));

import { executeSellerTransfer } from "./execute-transfer";

function scenario(): { seller_transfers: any[] } {
  return {
    seller_transfers: [
      {
        id: "st-1",
        transaction_id: "tx-1",
        seller_id: "seller-1",
        amount_minor: 4_500,
        currency: "EUR",
        status: "queued",
        stripe_account_id: "acct_seller",
        source_charge_id: "ch_order_1",
        transfer_group: "order_tx-1",
        stripe_transfer_id: null,
      },
    ],
  };
}

describe("executeSellerTransfer", () => {
  beforeEach(() => {
    mocks.transfersCreate.mockReset();
    mocks.transfersCreate.mockResolvedValue({
      id: "tr_order_1",
      source_transaction: "ch_order_1",
      transfer_group: "order_tx-1",
    });
  });

  it("uses source charge, transfer group, metadata and a stable key", async () => {
    const db = createMockDb(scenario());
    client = db.client;

    await expect(executeSellerTransfer("tx-1")).resolves.toBe("tr_order_1");

    expect(mocks.transfersCreate).toHaveBeenCalledWith(
      {
        amount: 4_500,
        currency: "eur",
        destination: "acct_seller",
        source_transaction: "ch_order_1",
        transfer_group: "order_tx-1",
        metadata: {
          transaction_id: "tx-1",
          seller_id: "seller-1",
          type: "order_release",
        },
      },
      { idempotencyKey: "order-transfer-tx-1" },
    );
    expect(db.state.seller_transfers[0]).toMatchObject({
      status: "transferred",
      stripe_transfer_id: "tr_order_1",
    });
  });

  it("does not create another transfer after durable success", async () => {
    const data = scenario();
    data.seller_transfers[0].status = "transferred";
    data.seller_transfers[0].stripe_transfer_id = "tr_existing";
    const db = createMockDb(data);
    client = db.client;

    await expect(executeSellerTransfer("tx-1")).resolves.toBe("tr_existing");
    expect(mocks.transfersCreate).not.toHaveBeenCalled();
  });

  it("does not call Stripe after financial recovery cancels execution", async () => {
    const data = scenario();
    data.seller_transfers[0].cancellation_requested_at =
      "2026-07-28T00:00:00.000Z";
    const db = createMockDb(data);
    client = db.client;

    await expect(executeSellerTransfer("tx-1")).rejects.toMatchObject({
      message: expect.stringContaining("TRANSFER_CANCELED_FINANCIAL_RECOVERY"),
    });
    expect(mocks.transfersCreate).not.toHaveBeenCalled();
  });

  it("refuses lease reclaim while another worker's Stripe call is in flight", async () => {
    const data = scenario();
    data.seller_transfers[0].status = "processing";
    data.seller_transfers[0].execution_started_at = new Date().toISOString();
    const db = createMockDb(data);
    client = db.client;

    await expect(executeSellerTransfer("tx-1")).rejects.toMatchObject({
      message: expect.stringContaining("TRANSFER_IN_FLIGHT_RETRY"),
    });
    expect(mocks.transfersCreate).not.toHaveBeenCalled();
    expect(db.state.seller_transfers[0].execution_started_at).toBeTruthy();
  });

  it("clears the in-flight handshake after a confirmed Stripe failure", async () => {
    const data = scenario();
    const db = createMockDb(data);
    client = db.client;
    mocks.transfersCreate.mockRejectedValueOnce({
      code: "balance_insufficient",
      message: "insufficient funds",
    });

    await expect(executeSellerTransfer("tx-1")).rejects.toMatchObject({
      code: "balance_insufficient",
    });
    expect(db.state.seller_transfers[0]).toMatchObject({
      status: "failed",
      execution_started_at: null,
      failure_code: "balance_insufficient",
    });
  });
});
