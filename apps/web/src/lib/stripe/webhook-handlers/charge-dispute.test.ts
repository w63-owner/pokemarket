/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";
import { IDS } from "@/test-utils/fixtures";
import { calcPriceSeller } from "@/lib/pricing";
import type Stripe from "stripe";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@/lib/push/send", () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}));

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import {
  handleChargeDisputeClosed,
  handleChargeDisputeCreated,
} from "./charge-dispute";

function disputeFixture(
  overrides: Partial<Stripe.Dispute> = {},
): Stripe.Dispute {
  return {
    id: "dp_test_1",
    object: "dispute",
    amount: 11000,
    currency: "eur",
    charge: "ch_test_1",
    status: "needs_response",
    reason: "fraudulent",
    evidence_details: { due_by: Math.floor(Date.now() / 1000) + 86400 },
    ...overrides,
  } as Stripe.Dispute;
}

function completedScenario() {
  const cardNet = calcPriceSeller(100);
  return {
    transactions: [
      {
        id: IDS.TX,
        listing_id: IDS.LISTING,
        buyer_id: IDS.BUYER,
        seller_id: IDS.SELLER,
        status: "COMPLETED",
        total_amount: 110,
        shipping_cost: 10,
        stripe_charge_id: "ch_test_1",
      },
    ],
    wallets: [
      {
        user_id: IDS.SELLER,
        pending_balance: 0,
        available_balance: cardNet + 10,
        version: 0,
      },
    ],
    stripe_disputes: [] as Record<string, unknown>[],
  };
}

describe("handleChargeDisputeCreated/Closed — COMPLETED chargebacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("locks available_balance for COMPLETED orders (not only pending)", async () => {
    const cardNet = calcPriceSeller(100);
    const db = createMockDb(completedScenario());
    mockClient = db.client;

    await handleChargeDisputeCreated(disputeFixture());

    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER)!;
    expect(wallet.pending_balance).toBe(0);
    expect(wallet.available_balance).toBeCloseTo(0, 2);

    const dispute = db.state.stripe_disputes.find(
      (d) => d.stripe_dispute_id === "dp_test_1",
    )!;
    expect(dispute.previous_transaction_status).toBe("COMPLETED");
    expect(dispute.locked_from_pending).toBe(0);
    expect(dispute.locked_from_available).toBeCloseTo(cardNet + 10, 2);

    const tx = db.state.transactions.find((t) => t.id === IDS.TX)!;
    expect(tx.status).toBe("DISPUTED");
  });

  it("on won, restores available_balance and COMPLETED status (no double-credit)", async () => {
    const cardNet = calcPriceSeller(100);
    const db = createMockDb(completedScenario());
    mockClient = db.client;

    await handleChargeDisputeCreated(disputeFixture());
    await handleChargeDisputeClosed(
      disputeFixture({ status: "won", amount: 11000 }),
    );

    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER)!;
    expect(wallet.available_balance).toBeCloseTo(cardNet + 10, 2);
    expect(wallet.pending_balance).toBe(0);

    const tx = db.state.transactions.find((t) => t.id === IDS.TX)!;
    expect(tx.status).toBe("COMPLETED");

    const dispute = db.state.stripe_disputes.find(
      (d) => d.stripe_dispute_id === "dp_test_1",
    )!;
    expect(dispute.funds_restored).toBe(true);

    // Replay must not mint a second credit.
    await handleChargeDisputeClosed(
      disputeFixture({ status: "won", amount: 11000 }),
    );
    const walletAfterReplay = db.state.wallets.find(
      (w) => w.user_id === IDS.SELLER,
    )!;
    expect(walletAfterReplay.available_balance).toBeCloseTo(cardNet + 10, 2);
    expect(walletAfterReplay.pending_balance).toBe(0);
  });

  it("locks pending_balance for PAID orders and restores to PAID on won", async () => {
    const cardNet = calcPriceSeller(100);
    const db = createMockDb({
      transactions: [
        {
          id: IDS.TX,
          listing_id: IDS.LISTING,
          buyer_id: IDS.BUYER,
          seller_id: IDS.SELLER,
          status: "PAID",
          total_amount: 110,
          shipping_cost: 10,
          stripe_charge_id: "ch_test_1",
        },
      ],
      wallets: [
        {
          user_id: IDS.SELLER,
          pending_balance: cardNet + 10,
          available_balance: 0,
          version: 0,
        },
      ],
    });
    mockClient = db.client;

    await handleChargeDisputeCreated(disputeFixture());
    const locked = db.state.wallets.find((w) => w.user_id === IDS.SELLER)!;
    expect(locked.pending_balance).toBeCloseTo(0, 2);
    expect(locked.available_balance).toBe(0);

    await handleChargeDisputeClosed(disputeFixture({ status: "won" }));
    const restored = db.state.wallets.find((w) => w.user_id === IDS.SELLER)!;
    expect(restored.pending_balance).toBeCloseTo(cardNet + 10, 2);
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PAID",
    );
  });
});
