/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";
import { basicScenario, IDS } from "@/test-utils/fixtures";

// Track Stripe SDK behaviour
let checkoutSessionRetrieveImpl: () => any = () => ({
  payment_status: "paid",
  amount_total: 10570,
  currency: "eur",
  metadata: { transaction_id: IDS.TX },
});
let paymentIntentRetrieveImpl: () => any = () => ({
  id: "pi_test_1",
  status: "succeeded",
  amount: 10570,
  currency: "eur",
  metadata: { transaction_id: IDS.TX },
});

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        retrieve: vi.fn(async () => checkoutSessionRetrieveImpl()),
      },
    },
    paymentIntents: {
      retrieve: vi.fn(async () => paymentIntentRetrieveImpl()),
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
  checkoutSessionRetrieveImpl = () => ({
    payment_status: "paid",
    amount_total: 10570,
    currency: "eur",
    metadata: { transaction_id: IDS.TX },
  });
  paymentIntentRetrieveImpl = () => ({
    id: "pi_test_1",
    status: "succeeded",
    amount: 10570,
    currency: "eur",
    metadata: { transaction_id: IDS.TX },
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
    checkoutSessionRetrieveImpl = () => ({ payment_status: "unpaid" });
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

  it("rejects a paid session for a different transaction", async () => {
    checkoutSessionRetrieveImpl = () => ({
      payment_status: "paid",
      amount_total: 10570,
      currency: "eur",
      metadata: { transaction_id: "other-transaction" },
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    const result = await reconcileCheckoutSession(IDS.TX, "cs_other");

    expect(result).toBe("PENDING_PAYMENT");
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PENDING_PAYMENT",
    );
  });

  it("rejects an underpaid session for the transaction", async () => {
    checkoutSessionRetrieveImpl = () => ({
      payment_status: "paid",
      amount_total: 500,
      currency: "eur",
      metadata: { transaction_id: IDS.TX },
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    const result = await reconcileCheckoutSession(IDS.TX, "cs_underpaid");

    expect(result).toBe("PENDING_PAYMENT");
    expect(
      db.state.wallets.find((w) => w.user_id === IDS.SELLER)?.pending_balance,
    ).toBe(0);
  });
});

describe("reconcilePaymentIntent — payment binding", () => {
  it("finalizes a succeeded PaymentIntent bound to the transaction", async () => {
    const scenario = basicScenario();
    scenario.transactions![0].stripe_payment_intent_id = "pi_test_1";
    const db = createMockDb(scenario);
    mockClient = db.client;

    const result = await reconcilePaymentIntent(IDS.TX, "pi_test_1");

    expect(result).toBe("PAID");
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PAID",
    );
  });

  it("rejects a succeeded PaymentIntent for a different transaction", async () => {
    paymentIntentRetrieveImpl = () => ({
      id: "pi_other",
      status: "succeeded",
      amount: 10570,
      currency: "eur",
      metadata: { transaction_id: "other-transaction" },
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    const result = await reconcilePaymentIntent(IDS.TX, "pi_other");

    expect(result).toBe("PENDING_PAYMENT");
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PENDING_PAYMENT",
    );
  });

  it("rejects an underpaid PaymentIntent for the transaction", async () => {
    paymentIntentRetrieveImpl = () => ({
      id: "pi_underpaid",
      status: "succeeded",
      amount: 500,
      currency: "eur",
      metadata: { transaction_id: IDS.TX },
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    const result = await reconcilePaymentIntent(IDS.TX, "pi_underpaid");

    expect(result).toBe("PENDING_PAYMENT");
    expect(
      db.state.wallets.find((w) => w.user_id === IDS.SELLER)?.pending_balance,
    ).toBe(0);
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
    checkoutSessionRetrieveImpl = () => {
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
    checkoutSessionRetrieveImpl = () => {
      attempt++;
      return {
        payment_status: attempt < 2 ? "unpaid" : "paid",
        amount_total: 10570,
        currency: "eur",
        metadata: { transaction_id: IDS.TX },
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
