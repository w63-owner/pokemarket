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
});
