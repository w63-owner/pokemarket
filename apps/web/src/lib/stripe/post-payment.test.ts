/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { createMockDb, type MockDb } from "@/test-utils/db-mock";
import { basicScenario, IDS } from "@/test-utils/fixtures";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import { finalizePaidTransaction } from "./post-payment";

// finalize now hands push + email to the durable outbox instead of sending
// inline; assertions inspect the enqueued rows rather than send spies.
function outbox(db: MockDb) {
  return db.state.notifications_outbox ?? [];
}
function emailRows(db: MockDb) {
  return outbox(db).filter((r) => r.channel === "email");
}
function pushRows(db: MockDb) {
  return outbox(db).filter((r) => r.channel === "push");
}

// ─── QA: Happy path ──────────────────────────────────────────────────────────
describe("finalizePaidTransaction — QA happy path", () => {
  it("transitions PENDING_PAYMENT → PAID and triggers all side effects", async () => {
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    const result = await finalizePaidTransaction(IDS.TX);

    expect(result).toBe("PAID");

    const tx = db.state.transactions.find((t) => t.id === IDS.TX);
    expect(tx?.status).toBe("PAID");

    const listing = db.state.listings.find((l) => l.id === IDS.LISTING);
    expect(listing?.status).toBe("SOLD");

    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    // 105.7 total - 5.7 platform fee = 100 seller net.
    expect(wallet?.pending_balance).toBeCloseTo(100, 2);

    // Other PENDING offers on this listing → EXPIRED
    expect(
      db.state.offers.find((o) => o.id === "offer-pending-1")?.status,
    ).toBe("EXPIRED");

    // System message inserted
    const msg = db.state.messages.find(
      (m) => m.message_type === "payment_completed",
    );
    expect(msg).toBeTruthy();
    expect(msg?.metadata?.transaction_id).toBe(IDS.TX);

    // Both buyer + seller emails enqueued into the outbox
    const emails = emailRows(db);
    expect(emails).toHaveLength(2);
    expect(emails.some((e) => e.payload.to === "buyer@example.com")).toBe(true);
    expect(emails.some((e) => e.payload.to === "seller@example.com")).toBe(
      true,
    );
    expect(
      emails.some((e) => e.payload.template === "order-confirmation"),
    ).toBe(true);
    expect(emails.some((e) => e.payload.template === "sale-notification")).toBe(
      true,
    );

    // Seller push enqueued
    const pushes = pushRows(db);
    expect(pushes).toHaveLength(1);
    expect(pushes[0].recipient_user_id).toBe(IDS.SELLER);
    expect(pushes[0].payload.category).toBe("commerce");
  });
});

// ─── QA: edge cases ──────────────────────────────────────────────────────────
describe("finalizePaidTransaction — QA edge cases", () => {
  it("returns NOT_FOUND when transaction does not exist", async () => {
    const db = createMockDb({ transactions: [] });
    mockClient = db.client;
    expect(await finalizePaidTransaction("nope")).toBe("NOT_FOUND");
    expect(outbox(db)).toHaveLength(0);
  });

  it("returns ALREADY_PROCESSED when status is already PAID", async () => {
    const scenario = basicScenario();
    scenario.transactions![0].status = "PAID";
    const db = createMockDb(scenario);
    mockClient = db.client;
    expect(await finalizePaidTransaction(IDS.TX)).toBe("ALREADY_PROCESSED");
    expect(outbox(db)).toHaveLength(0);
    expect(db.state.listings.find((l) => l.id === IDS.LISTING)?.status).toBe(
      "LOCKED",
    ); // unchanged
  });

  it("returns ALREADY_PROCESSED for terminal states (COMPLETED, REFUNDED)", async () => {
    for (const status of ["COMPLETED", "REFUNDED", "CANCELLED", "EXPIRED"]) {
      const scenario = basicScenario();
      scenario.transactions![0].status = status;
      const db = createMockDb(scenario);
      mockClient = db.client;
      expect(await finalizePaidTransaction(IDS.TX)).toBe("ALREADY_PROCESSED");
    }
  });

  it("does not credit wallet twice when called twice", async () => {
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    await finalizePaidTransaction(IDS.TX);
    await finalizePaidTransaction(IDS.TX);
    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    expect(wallet?.pending_balance).toBeCloseTo(100, 2);
    expect(emailRows(db)).toHaveLength(2); // only first call enqueued
  });

  it("handles transaction with shipping cost (seller receives card net + shipping)", async () => {
    const scenario = basicScenario();
    scenario.transactions![0].total_amount = 116.2; // 100 item + 10 ship + ~6 fees
    scenario.transactions![0].fee_amount = 5.72;
    scenario.transactions![0].shipping_cost = 10;
    const db = createMockDb(scenario);
    mockClient = db.client;
    await finalizePaidTransaction(IDS.TX);
    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    // 116.2 total - 5.72 fee = 110.48, including the shipping pass-through.
    expect(wallet?.pending_balance).toBeCloseTo(110.48, 2);
  });

  it("creates a conversation and posts the system message when none exists yet", async () => {
    const scenario = basicScenario();
    scenario.conversations = [];
    const db = createMockDb(scenario);
    mockClient = db.client;
    expect(await finalizePaidTransaction(IDS.TX)).toBe("PAID");

    // A fresh buyer↔seller conversation is created so the buyer always has a
    // thread, even when they purchased without messaging the seller first.
    expect(db.state.conversations).toHaveLength(1);
    const conv = db.state.conversations[0];
    expect(conv.listing_id).toBe(IDS.LISTING);
    expect(conv.buyer_id).toBe(IDS.BUYER);
    expect(conv.seller_id).toBe(IDS.SELLER);

    // The payment-completed system message lands in that new conversation.
    const msg = db.state.messages.find(
      (m) => m.message_type === "payment_completed",
    );
    expect(msg?.conversation_id).toBe(conv.id);
    expect(msg?.metadata?.transaction_id).toBe(IDS.TX);

    expect(emailRows(db)).toHaveLength(2); // emails still enqueued
  });

  it("fails before marking PAID if the seller wallet does not exist", async () => {
    const scenario = basicScenario();
    scenario.wallets = [];
    const db = createMockDb(scenario);
    mockClient = db.client;
    await expect(finalizePaidTransaction(IDS.TX)).rejects.toMatchObject({
      code: "P0004",
    });
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PENDING_PAYMENT",
    );
  });
});

// ─── STRESS: concurrent webhook + reconcile (and N parallel) ─────────────────
describe("finalizePaidTransaction — STRESS concurrency", () => {
  it("two simultaneous calls: exactly one wins, the other gets ALREADY_PROCESSED", async () => {
    const db = createMockDb(basicScenario(), { serializeWrites: true });
    mockClient = db.client;

    const [a, b] = await Promise.all([
      finalizePaidTransaction(IDS.TX),
      finalizePaidTransaction(IDS.TX),
    ]);

    const results = [a, b].sort();
    expect(results).toEqual(["ALREADY_PROCESSED", "PAID"]);

    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    expect(wallet?.pending_balance).toBeCloseTo(100, 2);
    expect(emailRows(db)).toHaveLength(2); // exactly one set of confirmations
  });

  it("50 parallel callers: exactly one PAID, 49 ALREADY_PROCESSED, no double-credit", async () => {
    const db = createMockDb(basicScenario(), { serializeWrites: true });
    mockClient = db.client;

    const results = await Promise.all(
      Array.from({ length: 50 }, () => finalizePaidTransaction(IDS.TX)),
    );

    expect(results.filter((r) => r === "PAID")).toHaveLength(1);
    expect(results.filter((r) => r === "ALREADY_PROCESSED")).toHaveLength(49);

    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    expect(wallet?.pending_balance).toBeCloseTo(100, 2);
    expect(emailRows(db)).toHaveLength(2); // not 100
    expect(pushRows(db)).toHaveLength(1); // not 50
  });

  it("100 sequential calls: still idempotent", async () => {
    const db = createMockDb(basicScenario(), { serializeWrites: true });
    mockClient = db.client;

    for (let i = 0; i < 100; i++) await finalizePaidTransaction(IDS.TX);

    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    expect(wallet?.pending_balance).toBeCloseTo(100, 2);
    expect(emailRows(db)).toHaveLength(2);
  });
});

// ─── CHAOS: failure injection ────────────────────────────────────────────────
describe("finalizePaidTransaction — CHAOS failure injection", () => {
  it("outbox enqueue failure does NOT roll back the transaction", async () => {
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    // Simulate the outbox INSERT throwing (e.g. table unavailable). The
    // transaction is already PAID, so finalize must swallow this and return
    // PAID — the in-app system message remains the strong guarantee.
    const originalFrom = db.client.from.bind(db.client);
    db.client.from = (name: string) => {
      const builder = originalFrom(name);
      if (name === "notifications_outbox") {
        builder.insert = () => {
          throw new Error("[chaos] outbox offline");
        };
      }
      return builder;
    };

    expect(await finalizePaidTransaction(IDS.TX)).toBe("PAID");
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PAID",
    );
    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    expect(wallet?.pending_balance).toBeCloseTo(100, 2);
    // Nothing was enqueued, but the strong side-effects all committed.
    expect(outbox(db)).toHaveLength(0);
    expect(
      db.state.messages.find((m) => m.message_type === "payment_completed"),
    ).toBeTruthy();
  });

  it("notification data-gathering failure does not break the transaction", async () => {
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    // The listing lookup used to build the email payloads throws. finalize
    // must still return PAID (notifications are best-effort post-commit).
    const originalFrom = db.client.from.bind(db.client);
    db.client.from = (name: string) => {
      const builder = originalFrom(name);
      if (name === "listings") {
        const origSelect = builder.select.bind(builder);
        builder.select = (cols?: string) => {
          if (cols && cols.includes("cover_image_url")) {
            builder.single = () => {
              throw new Error("[chaos] listing read failed");
            };
          }
          return origSelect(cols);
        };
      }
      return builder;
    };

    expect(await finalizePaidTransaction(IDS.TX)).toBe("PAID");
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PAID",
    );
    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    expect(wallet?.pending_balance).toBeCloseTo(100, 2);
  });

  it("network blips: SAFETY property — wallet is never double-credited", async () => {
    // Under chaos a single PAID transaction may be PARTIALLY processed (we
    // mark this as a known issue: see audit report — wallet credit / message
    // insert / offer expiry / listing update don't all check `.error`). What
    // we want to guarantee even under chaos:
    //   1. The wallet is NEVER double-credited
    //   2. The message is NEVER inserted twice
    //   3. The listing is NEVER reverted from SOLD
    const db = createMockDb(basicScenario(), {
      errorRate: 0.3,
      serializeWrites: true,
    });
    mockClient = db.client;

    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        await finalizePaidTransaction(IDS.TX);
      } catch {
        // expected during chaos
      }
    }

    db.chaos.errorRate = 0;

    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    // Either credited the right amount, or not credited at all (the bug)
    // — but never double-credited.
    const credit = wallet?.pending_balance ?? 0;
    expect([0, 100]).toContain(Math.round(credit));

    const paymentMessages = db.state.messages.filter(
      (m) => m.message_type === "payment_completed",
    );
    expect(paymentMessages.length).toBeLessThanOrEqual(1);

    const listing = db.state.listings.find((l) => l.id === IDS.LISTING);
    expect(["LOCKED", "SOLD"]).toContain(listing?.status);
  });

  it("finalization core failure leaves the transaction retryable instead of orphaned PAID", async () => {
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    const originalRpc = db.client.rpc.bind(db.client);
    let rpcAttempts = 0;
    db.client.rpc = (name: string, params: Record<string, unknown>) => {
      if (name === "finalize_paid_transaction_core") {
        rpcAttempts++;
        if (rpcAttempts === 1) {
          throw new Error("[chaos] finalize core failed before commit");
        }
      }
      return originalRpc(name, params);
    };

    await expect(finalizePaidTransaction(IDS.TX)).rejects.toThrow();

    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PENDING_PAYMENT",
    );
    expect(
      db.state.wallets.find((w) => w.user_id === IDS.SELLER)?.pending_balance,
    ).toBe(0);

    expect(await finalizePaidTransaction(IDS.TX)).toBe("PAID");
    expect(
      db.state.wallets.find((w) => w.user_id === IDS.SELLER)?.pending_balance,
    ).toBeCloseTo(100, 2);
  });
});
