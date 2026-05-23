/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";
import { basicScenario, IDS } from "@/test-utils/fixtures";

const sentEmails: { to: string; subject: string }[] = [];
const sentPushes: { userId: string; title: string }[] = [];
let pushShouldThrow = false;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/emails/send", () => ({
  sendEmail: vi.fn(async (to: string, subject: string) => {
    sentEmails.push({ to, subject });
  }),
}));
vi.mock("@/lib/push/send", () => ({
  sendPushNotification: vi.fn(async (userId: string, title: string) => {
    if (pushShouldThrow) throw new Error("[chaos] push offline");
    sentPushes.push({ userId, title });
  }),
}));
vi.mock("@/emails/order-confirmation", () => ({ default: () => null }));
vi.mock("@/emails/sale-notification", () => ({ default: () => null }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import { finalizePaidTransaction } from "./post-payment";

beforeEach(() => {
  sentEmails.length = 0;
  sentPushes.length = 0;
  pushShouldThrow = false;
});

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
    // 105.7 total, 0 shipping, calcPriceSeller of 105.7 ≈ (105.7 - 0.7)/1.05 = 100
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

    // Both emails sent
    expect(sentEmails).toHaveLength(2);
    expect(sentEmails.some((e) => e.to === "buyer@example.com")).toBe(true);
    expect(sentEmails.some((e) => e.to === "seller@example.com")).toBe(true);

    // Push sent to seller
    expect(sentPushes).toHaveLength(1);
    expect(sentPushes[0].userId).toBe(IDS.SELLER);
  });
});

// ─── QA: edge cases ──────────────────────────────────────────────────────────
describe("finalizePaidTransaction — QA edge cases", () => {
  it("returns NOT_FOUND when transaction does not exist", async () => {
    const db = createMockDb({ transactions: [] });
    mockClient = db.client;
    expect(await finalizePaidTransaction("nope")).toBe("NOT_FOUND");
    expect(sentEmails).toHaveLength(0);
  });

  it("returns ALREADY_PROCESSED when status is already PAID", async () => {
    const scenario = basicScenario();
    scenario.transactions![0].status = "PAID";
    const db = createMockDb(scenario);
    mockClient = db.client;
    expect(await finalizePaidTransaction(IDS.TX)).toBe("ALREADY_PROCESSED");
    expect(sentEmails).toHaveLength(0);
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
    expect(sentEmails).toHaveLength(2); // only first call sent
  });

  it("handles transaction with shipping cost (sellerNet excludes shipping)", async () => {
    const scenario = basicScenario();
    scenario.transactions![0].total_amount = 116.2; // 100 item + 10 ship + ~6 fees
    scenario.transactions![0].shipping_cost = 10;
    const db = createMockDb(scenario);
    mockClient = db.client;
    await finalizePaidTransaction(IDS.TX);
    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    // calcPriceSeller(116.2 - 10) = calcPriceSeller(106.2) = (106.2 - 0.7)/1.05 ≈ 100.476
    expect(wallet?.pending_balance).toBeGreaterThan(99);
    expect(wallet?.pending_balance).toBeLessThan(102);
  });

  it("works even if no conversation exists (no system message)", async () => {
    const scenario = basicScenario();
    scenario.conversations = [];
    const db = createMockDb(scenario);
    mockClient = db.client;
    expect(await finalizePaidTransaction(IDS.TX)).toBe("PAID");
    expect(db.state.messages).toHaveLength(0);
    expect(sentEmails).toHaveLength(2); // emails still sent
  });

  it("works even if seller wallet does not exist (no crediting, no crash)", async () => {
    const scenario = basicScenario();
    scenario.wallets = [];
    const db = createMockDb(scenario);
    mockClient = db.client;
    expect(await finalizePaidTransaction(IDS.TX)).toBe("PAID");
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
    expect(sentEmails).toHaveLength(2); // exactly one set of confirmations
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
    expect(sentEmails).toHaveLength(2); // not 100
    expect(sentPushes).toHaveLength(1); // not 50
  });

  it("100 sequential calls: still idempotent", async () => {
    const db = createMockDb(basicScenario(), { serializeWrites: true });
    mockClient = db.client;

    for (let i = 0; i < 100; i++) await finalizePaidTransaction(IDS.TX);

    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    expect(wallet?.pending_balance).toBeCloseTo(100, 2);
    expect(sentEmails).toHaveLength(2);
  });
});

// ─── CHAOS: failure injection ────────────────────────────────────────────────
describe("finalizePaidTransaction — CHAOS failure injection", () => {
  it("push notification failure does NOT roll back the transaction", async () => {
    pushShouldThrow = true;
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    expect(await finalizePaidTransaction(IDS.TX)).toBe("PAID");

    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PAID",
    );
    // Email still went out, only push failed
    expect(sentEmails).toHaveLength(2);
    expect(sentPushes).toHaveLength(0);
  });

  it("email throw does not break the transaction (Sentry-captured)", async () => {
    const { sendEmail } = await import("@/lib/emails/send");
    (sendEmail as any).mockImplementationOnce(() => {
      throw new Error("[chaos] email provider down");
    });

    const db = createMockDb(basicScenario());
    mockClient = db.client;

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

  it("KNOWN-LIMITATION: side-effect failure after PAID transition is NOT auto-recovered", async () => {
    // We use an atomic-gate concurrency model to GUARANTEE no double-credit.
    // The trade-off is that if the winner crashes after the PAID transition
    // but before completing all side-effects, the transaction can end up in
    // a partial state. Recovery requires manual replay or the buyer hitting
    // the success page reconcile path.
    //
    // Tracked in audit report as a follow-up: introduce a recovery cron or
    // wrap the entire flow in a Postgres RPC.
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    const originalFrom = db.client.from.bind(db.client);
    let walletWriteAttempts = 0;
    db.client.from = (name: string) => {
      const builder = originalFrom(name);
      if (name === "wallets") {
        const origUpdate = builder.update.bind(builder);
        builder.update = (patch: any) => {
          walletWriteAttempts++;
          if (walletWriteAttempts === 1) {
            throw new Error("[chaos] wallet write failed");
          }
          return origUpdate(patch);
        };
      }
      return builder;
    };

    await expect(finalizePaidTransaction(IDS.TX)).rejects.toThrow();

    // Tx is PAID but wallet not credited — partial state
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PAID",
    );
    expect(
      db.state.wallets.find((w) => w.user_id === IDS.SELLER)?.pending_balance,
    ).toBe(0);

    // Retry: short-circuits because tx is already PAID. The orphan persists
    // until manual recovery — but importantly, NO double-credit happens.
    expect(await finalizePaidTransaction(IDS.TX)).toBe("ALREADY_PROCESSED");
    expect(
      db.state.wallets.find((w) => w.user_id === IDS.SELLER)?.pending_balance,
    ).toBe(0);
  });
});
