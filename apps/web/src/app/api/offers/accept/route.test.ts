/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let currentUser: { id: string } | null = { id: "seller-1" };
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
vi.mock("@/lib/push/send", () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "./route";

beforeEach(() => {
  currentUser = { id: "seller-1" };
});

function makeReq(body: any) {
  return new Request("http://localhost/api/offers/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("offers/accept — listing reservation guards", () => {
  it("accepts a pending offer and reserves an ACTIVE listing", async () => {
    const db = createMockDb({
      offers: [
        {
          id: "o1",
          status: "PENDING",
          buyer_id: "buyer-1",
          listing_id: "L1",
          conversation_id: "c1",
          offer_amount: 42,
          listing: {
            id: "L1",
            title: "Charizard",
            seller_id: "seller-1",
          },
        },
      ],
      listings: [
        {
          id: "L1",
          seller_id: "seller-1",
          status: "ACTIVE",
          reserved_for: null,
          reserved_price: null,
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
    expect(db.state.offers[0].status).toBe("ACCEPTED");
    expect(db.state.listings[0].status).toBe("RESERVED");
    expect(db.state.listings[0].reserved_for).toBe("buyer-1");
    expect(db.state.listings[0].reserved_price).toBe(42);
  });

  it("refuses to overwrite a LOCKED listing and reverts the offer", async () => {
    const db = createMockDb({
      offers: [
        {
          id: "o1",
          status: "PENDING",
          buyer_id: "buyer-1",
          listing_id: "L1",
          conversation_id: "c1",
          offer_amount: 42,
          listing: {
            id: "L1",
            title: "Charizard",
            seller_id: "seller-1",
          },
        },
      ],
      listings: [
        {
          id: "L1",
          seller_id: "seller-1",
          status: "LOCKED",
          reserved_for: "buyer-2",
          reserved_price: 55,
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
    expect(res.status).toBe(409);
    expect(db.state.offers[0].status).toBe("PENDING");
    expect(db.state.listings[0].status).toBe("LOCKED");
    expect(db.state.listings[0].reserved_for).toBe("buyer-2");
  });

  it("refuses to overwrite a SOLD listing and reverts the offer", async () => {
    const db = createMockDb({
      offers: [
        {
          id: "o1",
          status: "PENDING",
          buyer_id: "buyer-1",
          listing_id: "L1",
          conversation_id: "c1",
          offer_amount: 42,
          listing: {
            id: "L1",
            title: "Charizard",
            seller_id: "seller-1",
          },
        },
      ],
      listings: [
        {
          id: "L1",
          seller_id: "seller-1",
          status: "SOLD",
          reserved_for: "buyer-2",
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
    expect(res.status).toBe(409);
    expect(db.state.offers[0].status).toBe("PENDING");
    expect(db.state.listings[0].status).toBe("SOLD");
  });

  it("only one of two concurrent accepts can reserve the listing", async () => {
    const db = createMockDb(
      {
        offers: [
          {
            id: "o1",
            status: "PENDING",
            buyer_id: "buyer-1",
            listing_id: "L1",
            conversation_id: "c1",
            offer_amount: 40,
            listing: {
              id: "L1",
              title: "Charizard",
              seller_id: "seller-1",
            },
          },
          {
            id: "o2",
            status: "PENDING",
            buyer_id: "buyer-2",
            listing_id: "L1",
            conversation_id: "c2",
            offer_amount: 45,
            listing: {
              id: "L1",
              title: "Charizard",
              seller_id: "seller-1",
            },
          },
        ],
        listings: [
          {
            id: "L1",
            seller_id: "seller-1",
            status: "ACTIVE",
            reserved_for: null,
            reserved_price: null,
          },
        ],
        conversations: [
          {
            id: "c1",
            listing_id: "L1",
            buyer_id: "buyer-1",
            seller_id: "seller-1",
          },
          {
            id: "c2",
            listing_id: "L1",
            buyer_id: "buyer-2",
            seller_id: "seller-1",
          },
        ],
      },
      { serializeWrites: true },
    );
    mockClient = db.client;

    const responses = await Promise.all([
      POST(makeReq({ offer_id: "o1", conversation_id: "c1" })),
      POST(makeReq({ offer_id: "o2", conversation_id: "c2" })),
    ]);
    const codes = responses.map((r) => r.status).sort();

    expect(codes).toEqual([200, 409]);
    expect(db.state.listings[0].status).toBe("RESERVED");
    const accepted = db.state.offers.filter((o) => o.status === "ACCEPTED");
    const pending = db.state.offers.filter((o) => o.status === "PENDING");
    const rejected = db.state.offers.filter((o) => o.status === "REJECTED");
    expect(accepted).toHaveLength(1);
    expect(pending.length + rejected.length).toBe(1);
  });
});
