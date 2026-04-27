/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let currentUser: { id: string; email?: string } | null = {
  id: "buyer-1",
  email: "buyer@example.com",
};

let mockClient: any;

const stripeCreate = vi.fn(async (params: any) => ({
  id: `cs_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  url: "https://checkout.stripe.com/...",
  metadata: params.metadata,
}));
const stripeRetrieve = vi.fn(async () => ({ payment_status: "unpaid" }));

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    checkout: {
      sessions: { create: stripeCreate, retrieve: stripeRetrieve },
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: currentUser }, error: null }),
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(async () => null),
  checkoutRateLimit: {} as any,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "./route";

beforeEach(() => {
  currentUser = { id: "buyer-1", email: "buyer@example.com" };
  stripeCreate.mockClear();
  stripeRetrieve.mockClear();
});

function makeReq(body: any) {
  return new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const LISTING_ID = "11111111-1111-4111-8111-111111111111";

function activeListingScenario() {
  return {
    listings: [
      {
        id: LISTING_ID,
        seller_id: "seller-1",
        title: "Charizard",
        cover_image_url: null,
        status: "ACTIVE",
        display_price: 50,
        delivery_weight_class: "standard",
      },
    ],
    profiles: [{ id: "buyer-1", stripe_customer_id: null }],
    transactions: [],
  };
}

const validBody = {
  listing_id: LISTING_ID,
  shipping_country: "FR",
  shipping_address_line: "1 rue de la Paix",
  shipping_address_city: "Paris",
  shipping_address_postcode: "75001",
};

describe("checkout — auth + validation", () => {
  it("rejects unauthenticated", async () => {
    currentUser = null;
    mockClient = createMockDb(activeListingScenario()).client;
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
  });

  it("rejects invalid body schema", async () => {
    mockClient = createMockDb(activeListingScenario()).client;
    const res = await POST(makeReq({ listing_id: "L1" })); // missing fields
    expect(res.status).toBe(400);
  });
});

describe("checkout — listing-status guards", () => {
  it("ACTIVE listing → success, listing → LOCKED, transaction created", async () => {
    const db = createMockDb(activeListingScenario());
    mockClient = db.client;
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBeTruthy();
    expect(json.transaction_id).toBeTruthy();
    expect(db.state.listings[0].status).toBe("LOCKED");
    expect(db.state.transactions).toHaveLength(1);
    expect(db.state.transactions[0].status).toBe("PENDING_PAYMENT");
  });

  it("blocks buying your own listing", async () => {
    const sc = activeListingScenario();
    sc.listings[0].seller_id = "buyer-1"; // viewer = seller
    mockClient = createMockDb(sc).client;
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(400);
  });

  it("blocks SOLD listing", async () => {
    const sc = activeListingScenario();
    sc.listings[0].status = "SOLD";
    mockClient = createMockDb(sc).client;
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(400);
  });

  it("blocks RESERVED listing reserved for someone else", async () => {
    const sc = activeListingScenario();
    sc.listings[0].status = "RESERVED";
    (sc.listings[0] as any).reserved_for = "other-buyer";
    mockClient = createMockDb(sc).client;
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(400);
  });

  it("allows RESERVED listing reserved for current user, uses reserved_price", async () => {
    const sc = activeListingScenario();
    sc.listings[0].status = "RESERVED";
    (sc.listings[0] as any).reserved_for = "buyer-1";
    (sc.listings[0] as any).reserved_price = 30;
    const db = createMockDb(sc);
    mockClient = db.client;
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);

    // Stripe was called with the reserved (discounted) unit_amount = 3000 cents
    const callArgs = stripeCreate.mock.calls[0][0];
    const itemAmount = callArgs.line_items[0].price_data.unit_amount;
    expect(itemAmount).toBe(3000);
  });

  it("LOCKED listing with paid stripe session → 400 (already paid)", async () => {
    stripeRetrieve.mockResolvedValueOnce({ payment_status: "paid" } as any);
    const sc = activeListingScenario();
    sc.listings[0].status = "LOCKED";
    (sc.transactions as any[]).push({
      id: "tx-existing",
      listing_id: LISTING_ID,
      buyer_id: "buyer-1",
      status: "PENDING_PAYMENT",
      stripe_checkout_session_id: "cs_paid",
      created_at: new Date().toISOString(),
    });
    mockClient = createMockDb(sc).client;
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(400);
  });
});

describe("checkout — STRESS concurrent buyers", () => {
  it("two buyers race on the same ACTIVE listing — only one gets 200, other gets 409", async () => {
    const db = createMockDb(activeListingScenario(), { serializeWrites: true });
    mockClient = db.client;

    const calls = await Promise.all([
      (async () => {
        currentUser = { id: "buyer-A", email: "a@x.com" };
        return POST(makeReq(validBody));
      })(),
      (async () => {
        currentUser = { id: "buyer-B", email: "b@x.com" };
        return POST(makeReq(validBody));
      })(),
    ]);

    const codes = calls.map((r) => r.status);
    expect(codes.filter((c) => c === 200)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(1);

    // Exactly ONE PENDING_PAYMENT transaction exists
    const pendingTxs = db.state.transactions.filter(
      (t) => t.listing_id === LISTING_ID && t.status === "PENDING_PAYMENT",
    );
    expect(pendingTxs).toHaveLength(1);
    expect(stripeCreate).toHaveBeenCalledTimes(1);
  });

  it("same buyer rapid-fires checkout 5 times: at most one Stripe session created", async () => {
    const db = createMockDb(activeListingScenario(), { serializeWrites: true });
    mockClient = db.client;

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => POST(makeReq(validBody))),
    );
    const codes = responses.map((r) => r.status);

    expect(codes.filter((c) => c === 200)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(4);
    expect(stripeCreate).toHaveBeenCalledTimes(1);

    const activePending = db.state.transactions.filter(
      (t) =>
        t.listing_id === LISTING_ID &&
        t.buyer_id === "buyer-1" &&
        t.status === "PENDING_PAYMENT",
    );
    expect(activePending).toHaveLength(1);
  });
});

describe("checkout — CHAOS", () => {
  it("Stripe session creation fails AFTER tx insert → 500 returned, cron will clean up", async () => {
    stripeCreate.mockRejectedValueOnce(new Error("[chaos] Stripe down"));
    const db = createMockDb(activeListingScenario());
    mockClient = db.client;
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);

    // Known limitation — the tx + LOCKED state persist until release-expired
    // cron cleans them up (after CHECKOUT_LOCK_MINUTES). Verified separately
    // in src/app/api/cron/release-expired/route.test.ts.
    expect(db.state.listings[0].status).toBe("LOCKED");
    expect(db.state.transactions[0].status).toBe("PENDING_PAYMENT");
  });
});
