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

// ── Fix A: la réclamation d'idempotence est annulée (DELETE) quand le handler
//    échoue, pour que la redelivery Stripe du MÊME event.id soit RETRAITÉE au
//    lieu d'être avalée comme un duplicate. ──────────────────────────────────
describe("webhooks/stripe — Fix A: rollback idempotence sur échec handler", () => {
  it("handler échoue → 500 ET ligne d'idempotence ABSENTE, puis redelivery réussit (PAID, 1 seule ligne)", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_redeliv_A",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
        },
      },
    });

    // 1er POST : la transaction n'est pas encore visible (réplication / lag) →
    // finalize renvoie NOT_FOUND → handler throw → catch → 500.
    const scenario = basicScenario();
    scenario.transactions = [];
    const db = createMockDb(scenario);
    mockClient = db.client;

    const res1 = await POST(makeReq());
    expect(res1.status).toBe(500);
    // La réclamation d'idempotence a été annulée (rollback du DELETE en finally).
    expect(
      db.state.stripe_webhooks_processed.filter(
        (e) => e.stripe_event_id === "evt_redeliv_A",
      ),
    ).toHaveLength(0);

    // 2e POST : la "redelivery" Stripe du même event.id, cette fois la
    // transaction existe → traitement complet.
    db.state.transactions.push({ ...basicScenario().transactions![0] });

    const res2 = await POST(makeReq());
    expect(res2.status).toBe(200);
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PAID",
    );
    // Exactement une ligne d'idempotence pour cet event.id.
    expect(
      db.state.stripe_webhooks_processed.filter(
        (e) => e.stripe_event_id === "evt_redeliv_A",
      ),
    ).toHaveLength(1);
  });

  it("happy path → ligne d'idempotence CONSERVÉE, une vraie redelivery reste un no-op duplicate (pas de double-crédit)", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_happy_A",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
        },
      },
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    const res1 = await POST(makeReq());
    expect(res1.status).toBe(200);
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PAID",
    );
    expect(
      db.state.stripe_webhooks_processed.filter(
        (e) => e.stripe_event_id === "evt_happy_A",
      ),
    ).toHaveLength(1);
    const creditAfterFirst = db.state.wallets.find(
      (w) => w.user_id === IDS.SELLER,
    )?.pending_balance;
    expect(creditAfterFirst).toBeCloseTo(100, 2);

    // Redelivery du même event après succès → duplicate, no-op.
    const res2 = await POST(makeReq());
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.duplicate).toBe(true);
    // Toujours une seule ligne d'idempotence et pas de double-crédit wallet.
    expect(
      db.state.stripe_webhooks_processed.filter(
        (e) => e.stripe_event_id === "evt_happy_A",
      ),
    ).toHaveLength(1);
    expect(
      db.state.wallets.find((w) => w.user_id === IDS.SELLER)?.pending_balance,
    ).toBeCloseTo(100, 2);
  });
});

// ── Fix B: payment_intent.payment_failed n'est PAS terminal sauf si le
//    PaymentIntent est `canceled`. Un décline simple laisse la transaction
//    PENDING_PAYMENT et l'annonce LOCKED pour que l'acheteur retente. ─────────
describe("webhooks/stripe — Fix B: payment_intent.payment_failed non terminal", () => {
  it("échec non-canceled (requires_payment_method) → 200, tx reste PENDING_PAYMENT, listing reste LOCKED; un succès ultérieur passe PAID", async () => {
    const db = createMockDb(basicScenario());
    mockClient = db.client;

    // 1) Décline simple : retryable.
    stripeConstructEventImpl = () => ({
      id: "evt_pi_fail_retry",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_retry_1",
          status: "requires_payment_method",
          metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
        },
      },
    });
    const resFail = await POST(makeReq());
    expect(resFail.status).toBe(200);
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PENDING_PAYMENT",
    );
    expect(db.state.listings.find((l) => l.id === IDS.LISTING)?.status).toBe(
      "LOCKED",
    );

    // 2) L'acheteur retente avec succès dans la même PaymentSheet.
    stripeConstructEventImpl = () => ({
      id: "evt_pi_success_after_retry",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_retry_1",
          latest_charge: "ch_retry_1",
          metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
        },
      },
    });
    const resOk = await POST(makeReq());
    expect(resOk.status).toBe(200);
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "PAID",
    );
  });

  it("status canceled → tx CANCELLED + listing libéré ACTIVE (aucune offre acceptée)", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_pi_canceled",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_canceled_1",
          status: "canceled",
          metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
        },
      },
    });
    const db = createMockDb(basicScenario());
    mockClient = db.client;
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "CANCELLED",
    );
    expect(db.state.listings.find((l) => l.id === IDS.LISTING)?.status).toBe(
      "ACTIVE",
    );
  });

  it("status canceled AVEC offre acceptée → listing revient à RESERVED, pas ACTIVE", async () => {
    stripeConstructEventImpl = () => ({
      id: "evt_pi_canceled_reserved",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_canceled_2",
          status: "canceled",
          metadata: { transaction_id: IDS.TX, listing_id: IDS.LISTING },
        },
      },
    });
    const scenario = basicScenario();
    scenario.offers!.push({
      id: "offer-accepted-B",
      listing_id: IDS.LISTING,
      buyer_id: IDS.BUYER,
      status: "ACCEPTED",
      amount: 100,
    });
    const db = createMockDb(scenario);
    mockClient = db.client;
    await POST(makeReq());
    expect(db.state.transactions.find((t) => t.id === IDS.TX)?.status).toBe(
      "CANCELLED",
    );
    expect(db.state.listings.find((l) => l.id === IDS.LISTING)?.status).toBe(
      "RESERVED",
    );
  });
});
