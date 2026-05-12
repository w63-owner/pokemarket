/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let mockClient: any;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockClient,
}));

import { acceptOffer, rejectOffer, createOffer } from "./offers";

function withAuth(client: any, userId: string) {
  client.auth = {
    getUser: async () => ({ data: { user: { id: userId } }, error: null }),
  };
}

beforeEach(() => {
  // reset
});

// Patch the mock to support .neq() since acceptOffer uses it
function patchNeq(client: any) {
  const origFrom = client.from.bind(client);
  client.from = (name: string) => {
    const b = origFrom(name);
    b.neq = (col: string, val: any) => {
      b._neqFilters ??= [];
      b._neqFilters.push({ col, val });
      const wrap = (p: any) =>
        p.then((r: any) => {
          if (r.data && Array.isArray(r.data)) {
            r.data = r.data.filter(
              (row: any) =>
                !b._neqFilters.some((f: any) => row[f.col] === f.val),
            );
          }
          return r;
        });
      const origThen2 = b.then.bind(b);
      b.then = (onFulfilled: any, onRejected?: any) =>
        wrap(origThen2((r: any) => r, onRejected)).then(onFulfilled);
      return b;
    };
    return b;
  };
  return client;
}

describe("acceptOffer — concurrency safety", () => {
  it("happy path: PENDING → ACCEPTED, listing → RESERVED, system message inserted", async () => {
    const db = createMockDb({
      offers: [
        {
          id: "o1",
          status: "PENDING",
          listing_id: "L1",
          buyer_id: "B1",
          conversation_id: "c1",
        },
      ],
      listings: [{ id: "L1", status: "ACTIVE" }],
    });
    mockClient = patchNeq(db.client);
    withAuth(mockClient, "seller-1");

    await acceptOffer("o1", "L1", "B1", 25, "c1");

    expect(db.state.offers[0].status).toBe("ACCEPTED");
    expect(db.state.listings[0].status).toBe("RESERVED");
    expect(db.state.listings[0].reserved_for).toBe("B1");
    expect(db.state.listings[0].reserved_price).toBe(25);
    expect(
      db.state.messages.filter((m) => m.message_type === "offer_accepted"),
    ).toHaveLength(1);
  });

  it("rejects acceptance of an already-ACCEPTED offer", async () => {
    const db = createMockDb({
      offers: [
        { id: "o1", status: "ACCEPTED", listing_id: "L1", buyer_id: "B1" },
      ],
      listings: [{ id: "L1", status: "RESERVED" }],
    });
    mockClient = patchNeq(db.client);
    withAuth(mockClient, "seller-1");
    await expect(acceptOffer("o1", "L1", "B1", 25, "c1")).rejects.toThrow(
      /ne peut plus être acceptée/,
    );
  });

  it("STRESS: seller double-clicks Accept — only one wins, no duplicate messages", async () => {
    const db = createMockDb(
      {
        offers: [
          {
            id: "o1",
            status: "PENDING",
            listing_id: "L1",
            buyer_id: "B1",
          },
        ],
        listings: [{ id: "L1", status: "ACTIVE" }],
      },
      { serializeWrites: true },
    );
    mockClient = patchNeq(db.client);
    withAuth(mockClient, "seller-1");

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => acceptOffer("o1", "L1", "B1", 25, "c1")),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    expect(
      db.state.messages.filter((m) => m.message_type === "offer_accepted"),
    ).toHaveLength(1);
  });
});

describe("rejectOffer — concurrency safety", () => {
  it("rejects PENDING → REJECTED with system message", async () => {
    const db = createMockDb({
      offers: [{ id: "o1", status: "PENDING", listing_id: "L1" }],
    });
    mockClient = db.client;
    withAuth(mockClient, "seller-1");
    await rejectOffer("o1", "c1");
    expect(db.state.offers[0].status).toBe("REJECTED");
    expect(
      db.state.messages.filter((m) => m.message_type === "offer_rejected"),
    ).toHaveLength(1);
  });

  it("STRESS: double-click Reject inserts only one message", async () => {
    const db = createMockDb(
      {
        offers: [{ id: "o1", status: "PENDING", listing_id: "L1" }],
      },
      { serializeWrites: true },
    );
    mockClient = db.client;
    withAuth(mockClient, "seller-1");
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => rejectOffer("o1", "c1")),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      db.state.messages.filter((m) => m.message_type === "offer_rejected"),
    ).toHaveLength(1);
  });
});

describe("createOffer — basic", () => {
  it("creates a PENDING offer + 'offer' system message", async () => {
    const db = createMockDb({});
    mockClient = db.client;
    withAuth(mockClient, "buyer-1");
    const offer = await createOffer("L1", 25, "c1");
    expect(offer.status).toBe("PENDING");
    expect(db.state.offers).toHaveLength(1);
    expect(db.state.messages).toHaveLength(1);
    expect(db.state.messages[0].message_type).toBe("offer");
  });
});
