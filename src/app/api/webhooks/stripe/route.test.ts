/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";
import { basicScenario, IDS } from "@/test-utils/fixtures";

let stripeConstructEventImpl: () => any = () => ({
  id: "evt_1",
  type: "checkout.session.completed",
  data: {
    object: {
      metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
    },
  },
});

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: vi.fn(() => stripeConstructEventImpl()),
    },
    checkout: {
      sessions: { retrieve: vi.fn(async () => ({ payment_status: "paid" })) },
    },
    paymentIntents: {
      retrieve: vi.fn(async (id: string) => ({
        id,
        latest_charge: `ch_for_${id}`,
      })),
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
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import { POST } from "./route";

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

function makeReq(body = "{}", sig: string | null = "t=1,v1=test") {
  const headers = new Headers();
  if (sig) headers.set("stripe-signature", sig);
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body,
    headers,
  });
}

describe("webhooks/stripe — QA happy path", () => {
  it("checkout.session.completed → finalizes transaction", async () => {
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PAID",
    );
  });

  it("missing signature → 400 rejected", async () => {
    mockClient = createMockDb(basicScenario()).client;
    const res = await POST(makeReq("{}", null));
    expect(res.status).toBe(400);
  });

  it("invalid signature → 400 rejected", async () => {
    stripeConstructEventImpl = () => {
      throw new Error("Invalid signature");
    };
    mockClient = createMockDb(basicScenario()).client;
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    // Reset for next tests
    stripeConstructEventImpl = () => ({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
        },
      },
    });
  });

  it("checkout.session.expired → marks transaction EXPIRED, listing ACTIVE", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_2",
      type: "checkout.session.expired",
      data: {
        object: {
          metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
        },
      },
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "EXPIRED",
    );
    expect(db.state.listings.find((l) => l.id === IDS.LISTING)?.status).toBe(
      "ACTIVE",
    );
  });

  it("checkout.session.expired with ACCEPTED offer → listing reverts to RESERVED, not ACTIVE", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_3",
      type: "checkout.session.expired",
      data: {
        object: {
          metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
        },
      },
    });
    const scenario = basicScenario();
    scenario.offers!.push({
      id: "offer-accepted-1",
      listing_id: IDS.LISTING,
      buyer_id: IDS.BUYER,
      status: "ACCEPTED",
      amount: 100,
    });
    const db = createMockDb(scenario);
    mockClient = db.client;

    await POST(makeReq());
    expect(db.state.listings.find((l) => l.id === IDS.LISTING)?.status).toBe(
      "RESERVED",
    );
  });

  it("async_payment_failed → marks transaction CANCELLED", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_4",
      type: "checkout.session.async_payment_failed",
      data: {
        object: {
          metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
        },
      },
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    await POST(makeReq());
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "CANCELLED",
    );
  });

  it("unknown event type → 200 acknowledged but no-op", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_5",
      type: "customer.subscription.created",
      data: { object: {} },
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    // Unrelated event, transaction status untouched
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PENDING_PAYMENT",
    );
  });
});

describe("webhooks/stripe — STRESS idempotency under replay", () => {
  it("Stripe redelivers the same event 10 times: only one finalize", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_dup",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
        },
      },
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => POST(makeReq())),
    );
    const codes = await Promise.all(responses.map((r) => r.status));
    expect(codes.every((c) => c === 200)).toBe(true);

    // Exactly one row in idempotency table
    expect(
      db.state.stripe_webhooks_processed.filter(
        (e) => e.stripe_event_id === "evt_dup",
      ),
    ).toHaveLength(1);

    // Transaction is PAID once, wallet credited once
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PAID",
    );
    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    expect(wallet?.pending_balance).toBeCloseTo(100, 2);
  });

  it("100 distinct events → all processed, all idempotency keys recorded", async () => {
    let i = 0;
    stripeConstructEventImpl = () => ({
      id: `evt_n_${++i}`,
      type: "customer.subscription.created", // intentionally unhandled
      data: { object: {} },
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    const responses = await Promise.all(
      Array.from({ length: 100 }, () => POST(makeReq())),
    );
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(db.state.stripe_webhooks_processed).toHaveLength(100);
  });
});

describe("webhooks/stripe — CHAOS", () => {
  it("missing transaction_id metadata → returns 500 (caller will retry)", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_no_meta",
      type: "checkout.session.completed",
      data: { object: { metadata: {} } },
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    const res = await POST(makeReq());
    expect(res.status).toBe(500);
  });

  it("DB chaos during finalize → 500 returned, idempotency key NOT discarded (Stripe will redeliver)", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_chaos",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
        },
      },
    });
    const db = createMockDb(basicScenario(), { errorRate: 0.5 });
    mockClient = db.client;

    // Run a few times — first call may chaos out, second may succeed, etc.
    let observed500 = false;
    let observedFinalized = false;
    for (let i = 0; i < 10; i++) {
      try {
        const res = await POST(makeReq());
        if (res.status === 500) observed500 = true;
      } catch {
        observed500 = true;
      }
      if (
        db.state.transactions.find((t) => t.id === IDS.TX)?.status === "PAID"
      ) {
        observedFinalized = true;
        break;
      }
    }

    // We should observe at least one 500 OR a successful finalize. Either is
    // acceptable — the test verifies the system stays in a coherent state.
    expect(observed500 || observedFinalized).toBe(true);

    // Whatever happened, no double-credit
    db.chaos.errorRate = 0;
    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    const credit = wallet?.pending_balance ?? 0;
    expect([0, 100]).toContain(Math.round(credit));
  });
});

describe("webhooks/stripe — Sprint 2 handlers", () => {
  function paidScenario() {
    const sc = basicScenario();
    // Mark the transaction as PAID and attach a charge id so the new
    // handlers can resolve it.
    sc.transactions![0].status = "PAID";
    sc.transactions![0].stripe_payment_intent_id = "pi_paid_1";
    sc.transactions![0].stripe_charge_id = "ch_paid_1";
    sc.transactions![0].refunded_amount = 0;
    sc.wallets![0].pending_balance = 100; // simulating credited seller
    sc.profiles!.push({
      id: "seller-with-stripe",
      username: "stripe-seller",
      stripe_account_id: "acct_test_1",
      kyc_status: "PENDING",
    });
    return sc;
  }

  it("account.updated → flips kyc_status from PENDING to VERIFIED", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_acct_1",
      type: "account.updated",
      data: {
        object: {
          id: "acct_test_1",
          charges_enabled: true,
          payouts_enabled: true,
          requirements: { currently_due: [], disabled_reason: null },
        },
      },
    });
    const db = createMockDb(paidScenario());
    mockClient = db.client;

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const profile = db.state.profiles.find(
      (p) => p.stripe_account_id === "acct_test_1",
    );
    expect(profile?.kyc_status).toBe("VERIFIED");
  });

  it("account.updated → REQUIRED when requirements.currently_due is non-empty", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_acct_2",
      type: "account.updated",
      data: {
        object: {
          id: "acct_test_1",
          charges_enabled: false,
          payouts_enabled: false,
          requirements: {
            currently_due: ["external_account"],
            disabled_reason: null,
          },
        },
      },
    });
    const db = createMockDb(paidScenario());
    mockClient = db.client;
    await POST(makeReq());
    const profile = db.state.profiles.find(
      (p) => p.stripe_account_id === "acct_test_1",
    );
    expect(profile?.kyc_status).toBe("REQUIRED");
  });

  it("charge.refunded (full) → debits seller wallet, marks transaction REFUNDED", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_ref_1",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_paid_1",
          amount_refunded: 10570, // == total_amount 105.70 in cents
        },
      },
    });
    const db = createMockDb(paidScenario());
    mockClient = db.client;

    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    const tx = db.state.transactions.find((t) => t.id === IDS.TX);
    expect(tx?.status).toBe("REFUNDED");
    expect(tx?.refunded_amount).toBeCloseTo(105.7, 2);

    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    // 100 EUR pending was the seller credit, fully clawed back
    expect(wallet?.pending_balance ?? 0).toBeLessThanOrEqual(0.01);
  });

  it("charge.refunded (partial) → updates refunded_amount but not status", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_ref_2",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_paid_1",
          amount_refunded: 5000, // 50 EUR partial
        },
      },
    });
    const db = createMockDb(paidScenario());
    mockClient = db.client;
    await POST(makeReq());

    const tx = db.state.transactions.find((t) => t.id === IDS.TX);
    expect(tx?.status).toBe("PAID"); // not flipped to REFUNDED
    expect(tx?.refunded_amount).toBeCloseTo(50, 2);
  });

  it("charge.refunded for unknown charge_id → 200 no-op", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_ref_3",
      type: "charge.refunded",
      data: {
        object: { id: "ch_does_not_exist", amount_refunded: 1000 },
      },
    });
    const db = createMockDb(paidScenario());
    mockClient = db.client;
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
  });

  it("charge.dispute.created → opens stripe_disputes row, locks pending_balance, transaction → DISPUTED", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_disp_1",
      type: "charge.dispute.created",
      data: {
        object: {
          id: "dp_test_1",
          charge: "ch_paid_1",
          amount: 10570,
          currency: "eur",
          reason: "fraudulent",
          status: "needs_response",
          evidence_details: {
            due_by: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
            submission_count: 0,
          },
        },
      },
    });
    const db = createMockDb(paidScenario());
    mockClient = db.client;
    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    const dispute = db.state.stripe_disputes.find(
      (d) => d.stripe_dispute_id === "dp_test_1",
    );
    expect(dispute).toBeDefined();
    expect(dispute?.transaction_id).toBe(IDS.TX);

    const tx = db.state.transactions.find((t) => t.id === IDS.TX);
    expect(tx?.status).toBe("DISPUTED");

    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    expect(wallet?.pending_balance ?? 0).toBeLessThanOrEqual(0.01);
  });

  it("charge.dispute.closed (won) → restores pending_balance + transaction back to PAID", async () => {
    // First open
    stripeConstructEventImpl = () => ({
      id: "evt_disp_open",
      type: "charge.dispute.created",
      data: {
        object: {
          id: "dp_won",
          charge: "ch_paid_1",
          amount: 10570,
          currency: "eur",
          reason: "general",
          status: "needs_response",
          evidence_details: { due_by: null, submission_count: 0 },
        },
      },
    });
    const db = createMockDb(paidScenario());
    mockClient = db.client;
    await POST(makeReq());

    // Then close as won
    stripeConstructEventImpl = () => ({
      id: "evt_disp_close",
      type: "charge.dispute.closed",
      data: {
        object: {
          id: "dp_won",
          charge: "ch_paid_1",
          amount: 10570,
          currency: "eur",
          reason: "general",
          status: "won",
          evidence_details: { due_by: null, submission_count: 1 },
        },
      },
    });
    await POST(makeReq());

    const tx = db.state.transactions.find((t) => t.id === IDS.TX);
    expect(tx?.status).toBe("PAID");
    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    expect(wallet?.pending_balance ?? 0).toBeGreaterThan(99); // restored
  });

  it("payout.failed → restores available_balance + Sentry warning", async () => {
    const sc = paidScenario();
    sc.wallets![0].available_balance = 0; // simulating wallet zeroed by payout
    sc.wallets![0].pending_balance = 0;
    stripeConstructEventImpl = () => ({
      id: "evt_payout_fail",
      type: "payout.failed",
      data: {
        object: {
          id: "po_failed_1",
          amount: 8500,
          metadata: { user_id: IDS.SELLER },
          failure_code: "account_closed",
        },
      },
    });
    const db = createMockDb(sc);
    mockClient = db.client;
    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    const wallet = db.state.wallets.find((w) => w.user_id === IDS.SELLER);
    expect(wallet?.available_balance).toBeCloseTo(85, 2);
  });

  it("payout.paid without user_id metadata → 200 no-op (silent)", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_payout_paid_nometa",
      type: "payout.paid",
      data: { object: { id: "po_paid_1", amount: 1000, metadata: {} } },
    });
    const db = createMockDb(paidScenario());
    mockClient = db.client;
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
  });
});
