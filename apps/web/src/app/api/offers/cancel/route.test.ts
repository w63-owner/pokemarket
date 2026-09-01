/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let currentUser: { id: string } | null = { id: "buyer-1" };
let mockClient: any;
const reconcileCheckoutSession = vi.fn();
const reconcilePaymentIntent = vi.fn();
const expireSession = vi.fn();
const cancelPaymentIntent = vi.fn();
const retrieveSession = vi.fn();
const retrievePaymentIntent = vi.fn();

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
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/stripe/reconcile", () => ({
  reconcileCheckoutSession: (...args: unknown[]) =>
    reconcileCheckoutSession(...args),
  reconcilePaymentIntent: (...args: unknown[]) =>
    reconcilePaymentIntent(...args),
}));
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        retrieve: (...args: unknown[]) => retrieveSession(...args),
        expire: (...args: unknown[]) => expireSession(...args),
      },
    },
    paymentIntents: {
      retrieve: (...args: unknown[]) => retrievePaymentIntent(...args),
      cancel: (...args: unknown[]) => cancelPaymentIntent(...args),
    },
  }),
}));

import { POST } from "./route";

beforeEach(() => {
  currentUser = { id: "buyer-1" };
  reconcileCheckoutSession.mockReset().mockResolvedValue("PENDING_PAYMENT");
  reconcilePaymentIntent.mockReset().mockResolvedValue("PENDING_PAYMENT");
  expireSession.mockReset().mockResolvedValue({});
  cancelPaymentIntent.mockReset().mockResolvedValue({});
  retrieveSession.mockReset().mockResolvedValue({ id: "cs_1", status: "open" });
  retrievePaymentIntent.mockReset().mockResolvedValue({
    id: "pi_1",
    status: "requires_payment_method",
  });
});

function makeReq(body: any) {
  return new Request("http://localhost/api/offers/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("offers/cancel — auth + validation", () => {
  it("rejects unauthenticated requests", async () => {
    currentUser = null;
    mockClient = createMockDb({}).client;
    const res = await POST(makeReq({ offer_id: "o1", conversation_id: "c1" }));
    expect(res.status).toBe(401);
  });

  it("rejects missing offer_id", async () => {
    mockClient = createMockDb({}).client;
    const res = await POST(makeReq({ conversation_id: "c1" }));
    expect(res.status).toBe(400);
  });

  it("rejects missing conversation_id", async () => {
    mockClient = createMockDb({}).client;
    const res = await POST(makeReq({ offer_id: "o1" }));
    expect(res.status).toBe(400);
  });
});

describe("offers/cancel — QA", () => {
  it("cancels a PENDING offer (buyer is owner)", async () => {
    const db = createMockDb({
      offers: [
        {
          id: "o1",
          status: "PENDING",
          buyer_id: "buyer-1",
          listing_id: "L1",
          conversation_id: "c1",
        },
      ],
      listings: [{ id: "L1", seller_id: "seller-1", status: "ACTIVE" }],
      conversations: [
        {
          id: "c1",
          listing_id: "L1",
          buyer_id: "buyer-1",
          seller_id: "seller-1",
        },
      ],
    });
    mockClient = db.client;
    const res = await POST(makeReq({ offer_id: "o1", conversation_id: "c1" }));
    expect(res.status).toBe(200);
    expect(db.state.offers[0].status).toBe("CANCELLED");
    // System message inserted
    const msg = db.state.messages.find(
      (m) => m.message_type === "offer_cancelled",
    );
    expect(msg).toBeTruthy();
  });

  it("cancels an ACCEPTED offer and reverts listing RESERVED → ACTIVE", async () => {
    const db = createMockDb({
      offers: [
        {
          id: "o1",
          status: "ACCEPTED",
          buyer_id: "buyer-1",
          listing_id: "L1",
          conversation_id: "c1",
        },
      ],
      listings: [
        {
          id: "L1",
          seller_id: "seller-1",
          status: "RESERVED",
          reserved_for: "buyer-1",
          reserved_price: 50,
        },
      ],
      conversations: [
        {
          id: "c1",
          listing_id: "L1",
          buyer_id: "buyer-1",
          seller_id: "seller-1",
        },
      ],
    });
    mockClient = db.client;
    const res = await POST(makeReq({ offer_id: "o1", conversation_id: "c1" }));
    expect(res.status).toBe(200);
    expect(db.state.offers[0].status).toBe("CANCELLED");
    const listing = db.state.listings[0];
    expect(listing.status).toBe("ACTIVE");
    expect(listing.reserved_for).toBeNull();
    expect(listing.reserved_price).toBeNull();
  });

  it("cancels an ACCEPTED offer during checkout and kills the pending Stripe session", async () => {
    const db = createMockDb({
      offers: [
        {
          id: "o1",
          status: "ACCEPTED",
          buyer_id: "buyer-1",
          listing_id: "L1",
          conversation_id: "c1",
        },
      ],
      listings: [
        {
          id: "L1",
          seller_id: "seller-1",
          status: "LOCKED",
          reserved_for: "buyer-1",
          reserved_price: 50,
        },
      ],
      conversations: [
        {
          id: "c1",
          listing_id: "L1",
          buyer_id: "buyer-1",
          seller_id: "seller-1",
        },
      ],
      transactions: [
        {
          id: "tx1",
          listing_id: "L1",
          buyer_id: "buyer-1",
          status: "PENDING_PAYMENT",
          stripe_checkout_session_id: "cs_1",
          stripe_payment_intent_id: null,
          created_at: "2026-08-01T10:00:00.000Z",
        },
      ],
    });
    mockClient = db.client;

    const res = await POST(makeReq({ offer_id: "o1", conversation_id: "c1" }));
    expect(res.status).toBe(200);
    expect(reconcileCheckoutSession).toHaveBeenCalledWith("tx1", "cs_1");
    expect(expireSession).toHaveBeenCalledWith("cs_1");
    expect(db.state.transactions[0].status).toBe("CANCELLED");
    expect(db.state.offers[0].status).toBe("CANCELLED");
    expect(db.state.listings[0].status).toBe("ACTIVE");
    expect(db.state.listings[0].reserved_for).toBeNull();
  });

  it("refuses cancel when the checkout session was already paid", async () => {
    reconcileCheckoutSession.mockResolvedValue("PAID");
    const db = createMockDb({
      offers: [
        {
          id: "o1",
          status: "ACCEPTED",
          buyer_id: "buyer-1",
          listing_id: "L1",
          conversation_id: "c1",
        },
      ],
      listings: [
        {
          id: "L1",
          seller_id: "seller-1",
          status: "LOCKED",
          reserved_for: "buyer-1",
        },
      ],
      conversations: [
        {
          id: "c1",
          listing_id: "L1",
          buyer_id: "buyer-1",
          seller_id: "seller-1",
        },
      ],
      transactions: [
        {
          id: "tx1",
          listing_id: "L1",
          buyer_id: "buyer-1",
          status: "PENDING_PAYMENT",
          stripe_checkout_session_id: "cs_1",
          created_at: "2026-08-01T10:00:00.000Z",
        },
      ],
    });
    mockClient = db.client;

    const res = await POST(makeReq({ offer_id: "o1", conversation_id: "c1" }));
    expect(res.status).toBe(409);
    expect(db.state.offers[0].status).toBe("ACCEPTED");
    expect(db.state.listings[0].status).toBe("LOCKED");
    expect(db.state.transactions[0].status).toBe("PENDING_PAYMENT");
    expect(expireSession).not.toHaveBeenCalled();
  });

  it("rejects cancel from a non-buyer (third party)", async () => {
    currentUser = { id: "stranger" };
    const db = createMockDb({
      offers: [
        {
          id: "o1",
          status: "PENDING",
          buyer_id: "buyer-1",
          listing_id: "L1",
        },
      ],
    });
    mockClient = db.client;
    const res = await POST(makeReq({ offer_id: "o1", conversation_id: "c1" }));
    expect(res.status).toBe(403);
    expect(db.state.offers[0].status).toBe("PENDING");
  });

  it("rejects cancel of an already-cancelled offer", async () => {
    const db = createMockDb({
      offers: [
        {
          id: "o1",
          status: "CANCELLED",
          buyer_id: "buyer-1",
          listing_id: "L1",
        },
      ],
    });
    mockClient = db.client;
    const res = await POST(makeReq({ offer_id: "o1", conversation_id: "c1" }));
    expect(res.status).toBe(400);
  });

  it("rejects cancel of a REJECTED offer", async () => {
    const db = createMockDb({
      offers: [
        {
          id: "o1",
          status: "REJECTED",
          buyer_id: "buyer-1",
          listing_id: "L1",
        },
      ],
    });
    mockClient = db.client;
    const res = await POST(makeReq({ offer_id: "o1", conversation_id: "c1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 for nonexistent offer", async () => {
    const db = createMockDb({ offers: [] });
    mockClient = db.client;
    const res = await POST(
      makeReq({ offer_id: "nope", conversation_id: "c1" }),
    );
    expect(res.status).toBe(404);
  });
});

describe("offers/cancel — STRESS", () => {
  it("buyer double-clicks Cancel: only one CANCELLED state, no extra messages", async () => {
    const db = createMockDb(
      {
        offers: [
          {
            id: "o1",
            status: "ACCEPTED",
            buyer_id: "buyer-1",
            listing_id: "L1",
            conversation_id: "c1",
          },
        ],
        listings: [
          {
            id: "L1",
            seller_id: "seller-1",
            status: "RESERVED",
            reserved_for: "buyer-1",
          },
        ],
        conversations: [
          {
            id: "c1",
            listing_id: "L1",
            buyer_id: "buyer-1",
            seller_id: "seller-1",
          },
        ],
      },
      { serializeWrites: true },
    );
    mockClient = db.client;

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        POST(makeReq({ offer_id: "o1", conversation_id: "c1" })),
      ),
    );
    const codes = responses.map((r) => r.status);

    // First wins (200), rest see CANCELLED → 400
    expect(codes.filter((c) => c === 200)).toHaveLength(1);
    expect(codes.filter((c) => c === 400)).toHaveLength(4);

    expect(db.state.offers[0].status).toBe("CANCELLED");
    expect(db.state.listings[0].status).toBe("ACTIVE");
    expect(
      db.state.messages.filter((m) => m.message_type === "offer_cancelled"),
    ).toHaveLength(1);
  });
});
