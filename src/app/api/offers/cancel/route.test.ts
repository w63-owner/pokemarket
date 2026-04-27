/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let currentUser: { id: string } | null = { id: "buyer-1" };
let mockClient: any;

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

import { POST } from "./route";

beforeEach(() => {
  currentUser = { id: "buyer-1" };
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
        },
      ],
      listings: [
        {
          id: "L1",
          status: "RESERVED",
          reserved_for: "buyer-1",
          reserved_price: 50,
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
          },
        ],
        listings: [
          {
            id: "L1",
            status: "RESERVED",
            reserved_for: "buyer-1",
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
