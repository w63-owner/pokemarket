/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";
import { basicScenario, IDS } from "@/test-utils/fixtures";

// Track Stripe SDK behaviour
let checkoutSessionRetrieveImpl: () => any = () => ({
  payment_status: "paid",
  metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
  amount_total: 10570,
  currency: "eur",
  payment_intent: { id: "pi_test_1", latest_charge: "ch_test_1" },
});
let paymentIntentRetrieveImpl: () => any = () => ({
  id: "pi_test_1",
  status: "succeeded",
  metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
  amount: 10570,
  amount_received: 10570,
  currency: "eur",
  latest_charge: "ch_test_1",
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
    metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
    amount_total: 10570,
    currency: "eur",
    payment_intent: { id: "pi_test_1", latest_charge: "ch_test_1" },
  });
  paymentIntentRetrieveImpl = () => ({
    id: "pi_test_1",
    status: "succeeded",
    metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
    amount: 10570,
    amount_received: 10570,
    currency: "eur",
    latest_charge: "ch_test_1",
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

  it("foreign paid Stripe session → returns PENDING_PAYMENT, does NOT finalize", async () => {
    checkoutSessionRetrieveImpl = () => ({
      payment_status: "paid",
      metadata: { transaction_id: "other-tx", listing_id: IDS.LISTING },
      amount_total: 10570,
      currency: "eur",
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    const result = await reconcileCheckoutSession(IDS.TX, "cs_foreign");
    expect(result).toBe("PENDING_PAYMENT");
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PENDING_PAYMENT",
    );
  });

  it("paid Stripe session for wrong amount → returns PENDING_PAYMENT, does NOT finalize", async () => {
    checkoutSessionRetrieveImpl = () => ({
      payment_status: "paid",
      metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
      amount_total: 500,
      currency: "eur",
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    const result = await reconcileCheckoutSession(IDS.TX, "cs_too_cheap");
    expect(result).toBe("PENDING_PAYMENT");
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PENDING_PAYMENT",
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
});

describe("reconcilePaymentIntent — QA", () => {
  it("succeeded PaymentIntent → finalizes transaction (returns PAID)", async () => {
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    const result = await reconcilePaymentIntent(IDS.TX, "pi_test_1");
    expect(result).toBe("PAID");
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PAID",
    );
  });

  it("foreign succeeded PaymentIntent → returns PENDING_PAYMENT, does NOT finalize", async () => {
    paymentIntentRetrieveImpl = () => ({
      id: "pi_foreign",
      status: "succeeded",
      metadata: { transaction_id: "other-tx", listing_id: IDS.LISTING },
      amount: 10570,
      amount_received: 10570,
      currency: "eur",
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    const result = await reconcilePaymentIntent(IDS.TX, "pi_foreign");
    expect(result).toBe("PENDING_PAYMENT");
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PENDING_PAYMENT",
    );
  });

  it("succeeded PaymentIntent for wrong amount → returns PENDING_PAYMENT, does NOT finalize", async () => {
    paymentIntentRetrieveImpl = () => ({
      id: "pi_too_cheap",
      status: "succeeded",
      metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
      amount: 500,
      amount_received: 500,
      currency: "eur",
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    const result = await reconcilePaymentIntent(IDS.TX, "pi_too_cheap");
    expect(result).toBe("PENDING_PAYMENT");
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PENDING_PAYMENT",
    );
  });

  it("processing PaymentIntent → returns PENDING_PAYMENT, does NOT finalize", async () => {
    paymentIntentRetrieveImpl = () => ({ status: "processing" });
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    const result = await reconcilePaymentIntent(IDS.TX, "pi_test_1");
    expect(result).toBe("PENDING_PAYMENT");
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PENDING_PAYMENT",
    );
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
      return attempt < 2
        ? { payment_status: "unpaid" }
        : {
            payment_status: "paid",
            metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
            amount_total: 10570,
            currency: "eur",
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
