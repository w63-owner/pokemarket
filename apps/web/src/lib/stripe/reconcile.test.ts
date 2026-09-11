/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";
import { basicScenario, IDS } from "@/test-utils/fixtures";

// Track Stripe SDK behaviour
let stripeRetrieveImpl: () => any = () => ({ payment_status: "paid" });
let stripePiRetrieveImpl: () => any = () => ({
  id: "pi_test",
  status: "succeeded",
  latest_charge: "ch_test",
});

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        retrieve: vi.fn(async () => stripeRetrieveImpl()),
      },
    },
    paymentIntents: {
      retrieve: vi.fn(async () => stripePiRetrieveImpl()),
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/emails/send", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/push/send", () => ({
  sendPushNotification: vi.fn(async () => undefined),
}));
vi.mock("@/emails/order-confirmation", () => ({ default: () => null }));
vi.mock("@/emails/sale-notification", () => ({ default: () => null }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import { reconcileCheckoutSession, reconcilePaymentIntent } from "./reconcile";

beforeEach(() => {
  stripeRetrieveImpl = () => ({ payment_status: "paid" });
  stripePiRetrieveImpl = () => ({
    id: "pi_test",
    status: "succeeded",
    latest_charge: "ch_test",
  });
});

describe("reconcileCheckoutSession — QA", () => {
  it("PAID Stripe session → finalizes transaction (returns PAID)", async () => {
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    const result = await reconcileCheckoutSession(IDS.TX, "cs_test_1");
    expect(result).toBe("PAID");
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PAID",
    );
  });

  it("UNPAID Stripe session → returns PENDING_PAYMENT, does NOT finalize", async () => {
    stripeRetrieveImpl = () => ({
      status: "open",
      payment_status: "unpaid",
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    const result = await reconcileCheckoutSession(IDS.TX, "cs_test_1");
    expect(result).toBe("PENDING_PAYMENT");
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PENDING_PAYMENT",
    );
    expect(db.state.listings.find((l) => l.id === IDS.LISTING)?.status).toBe(
      "LOCKED",
    );
  });

  it("complete unpaid asynchronous session → PENDING_ASYNC, does NOT finalize", async () => {
    stripeRetrieveImpl = () => ({
      status: "complete",
      payment_status: "unpaid",
      payment_intent: { id: "pi_sepa", status: "processing" },
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    const result = await reconcileCheckoutSession(IDS.TX, "cs_async_1");
    expect(result).toBe("PENDING_ASYNC");
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PENDING_PAYMENT",
    );
    expect(db.state.listings.find((l) => l.id === IDS.LISTING)?.status).toBe(
      "LOCKED",
    );
  });

  it("transaction does not exist → PENDING_PAYMENT (no-op)", async () => {
    const db = createMockDb({ transactions: [] });
    mockClient = db.client;
    const result = await reconcileCheckoutSession("nope", "cs_test_1");
    expect(result).toBe("PENDING_PAYMENT");
  });

  it("transaction already PAID → ALREADY_PROCESSED (no Stripe call)", async () => {
    const scenario = basicScenario();
    scenario.transactions![0].status = "PAID";
    const db = createMockDb(scenario);
    mockClient = db.client;
    const result = await reconcileCheckoutSession(IDS.TX, "cs_test_1");
    expect(result).toBe("ALREADY_PROCESSED");
  });

  it("transaction CANCELLED → ALREADY_PROCESSED", async () => {
    const scenario = basicScenario();
    scenario.transactions![0].status = "CANCELLED";
    const db = createMockDb(scenario);
    mockClient = db.client;
    const result = await reconcileCheckoutSession(IDS.TX, "cs_test_1");
    expect(result).toBe("ALREADY_PROCESSED");
  });
});

describe("reconcileCheckoutSession — STRESS", () => {
  it("buyer refresh-spams the success page: only one finalize", async () => {
    const db = createMockDb(basicScenario(), { serializeWrites: true });
    mockClient = db.client;

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        reconcileCheckoutSession(IDS.TX, "cs_test_1"),
      ),
    );

    expect(results.filter((r) => r === "PAID")).toHaveLength(1);
    expect(results.filter((r) => r === "ALREADY_PROCESSED")).toHaveLength(19);
    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    expect(wallet?.pending_balance).toBeCloseTo(100, 2);
  });
});

describe("reconcileCheckoutSession — CHAOS", () => {
  it("Stripe API throws → propagates error (caller sees failure)", async () => {
    stripeRetrieveImpl = () => {
      throw new Error("[chaos] Stripe down");
    };
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    await expect(
      reconcileCheckoutSession(IDS.TX, "cs_test_1"),
    ).rejects.toThrow();
    // Tx untouched
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PENDING_PAYMENT",
    );
  });

  it("Stripe returns unpaid then later paid: subsequent reconcile succeeds", async () => {
    let attempt = 0;
    stripeRetrieveImpl = () => {
      attempt++;
      return {
        status: "open",
        payment_status: attempt < 2 ? "unpaid" : "paid",
      };
    };
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    expect(await reconcileCheckoutSession(IDS.TX, "cs_test_1")).toBe(
      "PENDING_PAYMENT",
    );
    expect(await reconcileCheckoutSession(IDS.TX, "cs_test_1")).toBe("PAID");
  });
});

describe("reconcilePaymentIntent — async settlement", () => {
  it("processing PaymentIntent → PENDING_ASYNC, does NOT finalize", async () => {
    stripePiRetrieveImpl = () => ({
      id: "pi_processing",
      status: "processing",
      latest_charge: null,
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    const result = await reconcilePaymentIntent(IDS.TX, "pi_processing");
    expect(result).toBe("PENDING_ASYNC");
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PENDING_PAYMENT",
    );
    expect(db.state.listings.find((l) => l.id === IDS.LISTING)?.status).toBe(
      "LOCKED",
    );
  });
});
