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

import { handleChargeRefunded } from "./charge-refunded";
import * as Sentry from "@sentry/nextjs";

function chargeFixture(overrides: Partial<Stripe.Charge> = {}): Stripe.Charge {
  return {
    id: "ch_test_1",
    object: "charge",
    amount: 11000,
    amount_refunded: 0,
    currency: "eur",
    ...overrides,
  } as Stripe.Charge;
}

function refundScenario(
  overrides: {
    refunded_amount?: number;
    pending?: number;
    available?: number;
    status?: string;
  } = {},
) {
  return {
    transactions: [
      {
        id: IDS.TX,
        listing_id: IDS.LISTING,
        buyer_id: IDS.BUYER,
        seller_id: IDS.SELLER,
        status: overrides.status ?? "PAID",
        total_amount: 110,
        shipping_cost: 10,
        refunded_amount: overrides.refunded_amount ?? 0,
        stripe_charge_id: "ch_test_1",
      },
    ],
    wallets: [
      {
        user_id: IDS.SELLER,
        pending_balance: overrides.pending ?? 100,
        available_balance: overrides.available ?? 0,
        version: 0,
      },
    ],
  };
}

describe("handleChargeRefunded — partial refund shipping allocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not re-allocate already-refunded shipping on a second partial refund", async () => {
    // First refund of €5 already applied (shipping-first). Seller debited €5.
    // Seller card net for €100 card = calcPriceSeller(100).
    const cardNet = calcPriceSeller(100);
    const db = createMockDb(
      refundScenario({
        refunded_amount: 5,
        pending: round2(cardNet + 10 - 5),
      }),
    );
    mockClient = db.client;

    // Second refund brings cumulative amount_refunded to €15 (delta €10).
    // Correct split: remaining shipping €5 + card €5.
    await handleChargeRefunded(
      chargeFixture({ amount_refunded: 1500, amount: 11000 }),
    );

    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER)!;
    const expectedDebit = 5 + calcPriceSeller(5);
    const expectedPending = round2(cardNet + 10 - 5 - expectedDebit);

    expect(wallet.pending_balance).toBeCloseTo(expectedPending, 2);
    expect(
      db.state.transactions.find((t) => t.id === IDS.TX)?.refunded_amount,
    ).toBe(15);
  });

  it("debits calcPriceSeller(card) + shipping across two partial refunds totaling a full refund", async () => {
    const cardNet = calcPriceSeller(100);
    const db = createMockDb(
      refundScenario({
        refunded_amount: 0,
        pending: cardNet + 10,
      }),
    );
    mockClient = db.client;

    await handleChargeRefunded(
      chargeFixture({ amount_refunded: 1000, amount: 11000 }),
    );
    await handleChargeRefunded(
      chargeFixture({ amount_refunded: 11000, amount: 11000 }),
    );

    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER)!;
    expect(wallet.pending_balance).toBeCloseTo(0, 2);
    const tx = db.state.transactions.find((t) => t.id === IDS.TX)!;
    expect(tx.refunded_amount).toBe(110);
    expect(tx.status).toBe("REFUNDED");
  });

  it("throws when the wallet debit fails so Stripe can retry", async () => {
    const db = createMockDb(refundScenario({ pending: 100 }));
    const originalFrom = db.client.from.bind(db.client);
    db.client.from = (name: string) => {
      const builder = originalFrom(name);
      if (name !== "wallets") return builder;
      return {
        ...builder,
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                pending_balance: 100,
                available_balance: 0,
              },
              error: null,
            }),
          }),
        }),
        update: () => ({
          eq: async () => ({
            data: null,
            error: { message: "wallet write failed", code: "57014" },
          }),
        }),
      };
    };
    mockClient = db.client;

    await expect(
      handleChargeRefunded(
        chargeFixture({ amount_refunded: 500, amount: 11000 }),
      ),
    ).rejects.toMatchObject({ message: "wallet write failed" });

    // refunded_amount must remain unchanged so a retry can re-apply the debit.
    expect(
      db.state.transactions.find((t) => t.id === IDS.TX)?.refunded_amount,
    ).toBe(0);
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
