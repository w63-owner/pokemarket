/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockDb } from "@/test-utils/db-mock";
import { basicScenario, IDS } from "@/test-utils/fixtures";

let mockClient: any;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import {
  finalizePaidTransaction,
  processPaidTransactionEffects,
} from "./post-payment";

describe("Stripe post-payment ledger flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finalizes the financial state atomically through the RPC", async () => {
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    await expect(
      finalizePaidTransaction(IDS.TX, {
        paymentIntentId: "pi_test",
        chargeId: "ch_test",
      }),
    ).resolves.toBe("PAID");

    expect(db.state.transactions[0]).toMatchObject({
      status: "PAID",
      stripe_payment_intent_id: "pi_test",
      stripe_charge_id: "ch_test",
    });
    expect(db.state.listings[0].status).toBe("SOLD");
    expect(db.state.wallets[0].pending_balance).toBe(100);
    expect(db.state.ledger_transactions).toHaveLength(1);
    expect(
      db.state.ledger_entries.reduce(
        (sum, entry) => sum + entry.amount_minor,
        0,
      ),
    ).toBe(0);
    expect(db.state.financial_outbox).toHaveLength(1);
  });

  it("is concurrency-safe and does not duplicate ledger credits", async () => {
    const db = createMockDb(basicScenario(), { serializeWrites: true });
    mockClient = db.client;

    const results = await Promise.all([
      finalizePaidTransaction(IDS.TX),
      finalizePaidTransaction(IDS.TX),
    ]);

    expect(results.sort()).toEqual(["ALREADY_PROCESSED", "PAID"]);
    expect(db.state.ledger_transactions).toHaveLength(1);
    expect(db.state.financial_outbox).toHaveLength(1);
    expect(db.state.wallets[0].pending_balance).toBe(100);
  });

  it("backfills Stripe identifiers on an idempotent retry", async () => {
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    await finalizePaidTransaction(IDS.TX);
    await expect(
      finalizePaidTransaction(IDS.TX, {
        paymentIntentId: "pi_retry",
        chargeId: "ch_retry",
      }),
    ).resolves.toBe("ALREADY_PROCESSED");

    expect(db.state.transactions[0]).toMatchObject({
      stripe_payment_intent_id: "pi_retry",
      stripe_charge_id: "ch_retry",
    });
    expect(db.state.stripe_object_bindings).toHaveLength(2);
  });

  it("replays non-financial effects without duplicate outbox rows", async () => {
    const scenario = basicScenario();
    scenario.transactions![0].status = "PAID";
    const db = createMockDb(scenario);
    mockClient = db.client;

    await processPaidTransactionEffects(IDS.TX);
    await processPaidTransactionEffects(IDS.TX);

    expect(db.state.notifications_outbox).toHaveLength(4);
    expect(
      db.state.notifications_outbox.map((row) => row.idempotency_key).sort(),
    ).toEqual([
      `payment-email-buyer:${IDS.TX}`,
      `payment-email-seller:${IDS.TX}`,
      `payment-message:${IDS.TX}`,
      `payment-push-seller:${IDS.TX}`,
    ]);
    expect(db.state.messages).toHaveLength(0);
  });

  it.each(["REFUNDED", "CANCELLED"])(
    "does not recreate effects for a %s transaction",
    async (status) => {
      const scenario = basicScenario();
      scenario.transactions![0].status = status;
      const db = createMockDb(scenario);
      mockClient = db.client;

      await processPaidTransactionEffects(IDS.TX);

      expect(db.state.notifications_outbox).toHaveLength(0);
    },
  );
});
