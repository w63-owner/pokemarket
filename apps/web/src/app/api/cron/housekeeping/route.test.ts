/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import { GET } from "./route";

beforeEach(() => {
  process.env.CRON_SECRET = "test_secret";
});

const HOUR = 60 * 60 * 1000;

function authedReq() {
  return new Request("http://localhost/api/cron/housekeeping", {
    method: "GET",
    headers: { authorization: "Bearer test_secret" },
  });
}

describe("cron/housekeeping — auth", () => {
  it("rejects requests without bearer secret", async () => {
    mockClient = createMockDb({}).client;
    const res = await GET(
      new Request("http://localhost/api/cron/housekeeping"),
    );
    expect(res.status).toBe(401);
  });

  it("accepts requests with correct bearer secret", async () => {
    mockClient = createMockDb({}).client;
    const res = await GET(authedReq());
    expect(res.status).toBe(200);
  });
});

describe("cron/housekeeping — QA happy path", () => {
  it("expires PENDING offers past expires_at; leaves fresh ones alone", async () => {
    const db = createMockDb({
      offers: [
        {
          id: "stale",
          status: "PENDING",
          expires_at: new Date(Date.now() - HOUR).toISOString(),
        },
        {
          id: "fresh",
          status: "PENDING",
          expires_at: new Date(Date.now() + HOUR).toISOString(),
        },
        {
          id: "already-expired",
          status: "EXPIRED",
          expires_at: new Date(Date.now() - HOUR).toISOString(),
        },
      ],
    });
    mockClient = db.client;

    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.expired_offers).toBe(1);

    expect(db.state.offers.find((o) => o.id === "stale")?.status).toBe(
      "EXPIRED",
    );
    expect(db.state.offers.find((o) => o.id === "fresh")?.status).toBe(
      "PENDING",
    );
  });

  it("expires stale ACCEPTED offers (>48h) and frees their RESERVED listing", async () => {
    const cutoffTime = Date.now() - 60 * HOUR; // 60h ago
    const db = createMockDb({
      offers: [
        {
          id: "stale-accepted",
          status: "ACCEPTED",
          listing_id: "L1",
          buyer_id: "B1",
          created_at: new Date(cutoffTime).toISOString(),
        },
      ],
      listings: [
        {
          id: "L1",
          status: "RESERVED",
          reserved_for: "B1",
          reserved_price: 50,
        },
      ],
    });
    mockClient = db.client;

    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.expired_accepted_offers).toBe(1);
    expect(json.listings_freed).toBe(1);

    expect(db.state.offers.find((o) => o.id === "stale-accepted")?.status).toBe(
      "EXPIRED",
    );
    const listing = db.state.listings.find((l) => l.id === "L1");
    expect(listing?.status).toBe("ACTIVE");
    expect(listing?.reserved_for).toBeNull();
    expect(listing?.reserved_price).toBeNull();
  });

  it("does NOT free listing if it was paid and is now SOLD", async () => {
    const cutoffTime = Date.now() - 60 * HOUR;
    const db = createMockDb({
      offers: [
        {
          id: "stale-accepted",
          status: "ACCEPTED",
          listing_id: "L1",
          buyer_id: "B1",
          created_at: new Date(cutoffTime).toISOString(),
        },
      ],
      listings: [
        {
          id: "L1",
          status: "SOLD",
          reserved_for: null,
        },
      ],
    });
    mockClient = db.client;

    const res = await GET(authedReq());
    const json = await res.json();
    // Offer still gets EXPIRED but listing is untouched
    expect(json.expired_accepted_offers).toBe(1);
    expect(json.listings_freed).toBe(0);
    expect(db.state.listings.find((l) => l.id === "L1")?.status).toBe("SOLD");
  });

  it("does NOT free listing reserved for a different buyer", async () => {
    const cutoffTime = Date.now() - 60 * HOUR;
    const db = createMockDb({
      offers: [
        {
          id: "stale-accepted",
          status: "ACCEPTED",
          listing_id: "L1",
          buyer_id: "B1",
          created_at: new Date(cutoffTime).toISOString(),
        },
      ],
      listings: [
        {
          id: "L1",
          status: "RESERVED",
          reserved_for: "B-DIFFERENT",
        },
      ],
    });
    mockClient = db.client;

    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.listings_freed).toBe(0);
    const listing = db.state.listings.find((l) => l.id === "L1");
    expect(listing?.status).toBe("RESERVED");
    expect(listing?.reserved_for).toBe("B-DIFFERENT");
  });

  it("does NOT touch ACCEPTED offers younger than 48h", async () => {
    const recentTime = Date.now() - 12 * HOUR;
    const db = createMockDb({
      offers: [
        {
          id: "recent-accepted",
          status: "ACCEPTED",
          listing_id: "L1",
          buyer_id: "B1",
          created_at: new Date(recentTime).toISOString(),
        },
      ],
      listings: [{ id: "L1", status: "RESERVED", reserved_for: "B1" }],
    });
    mockClient = db.client;

    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.expired_accepted_offers).toBe(0);
    expect(json.listings_freed).toBe(0);
  });
});

describe("cron/housekeeping — STRESS", () => {
  it("100 stale offers in one run: all expired", async () => {
    const offers = Array.from({ length: 100 }, (_, i) => ({
      id: `o${i}`,
      status: "PENDING",
      expires_at: new Date(Date.now() - HOUR).toISOString(),
    }));
    const db = createMockDb({ offers });
    mockClient = db.client;

    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.expired_offers).toBe(100);
    expect(db.state.offers.every((o) => o.status === "EXPIRED")).toBe(true);
  });

  it("idempotent: running twice in a row produces same end state", async () => {
    const db = createMockDb({
      offers: [
        {
          id: "stale",
          status: "PENDING",
          expires_at: new Date(Date.now() - HOUR).toISOString(),
        },
      ],
    });
    mockClient = db.client;
    await GET(authedReq());
    const after1 = JSON.stringify(db.state.offers);
    await GET(authedReq());
    const after2 = JSON.stringify(db.state.offers);
    expect(after1).toBe(after2);
  });
});

describe("cron/housekeeping — CHAOS", () => {
  it("DB read failure on offers → 500 returned, no partial updates", async () => {
    const db = createMockDb({
      offers: [
        {
          id: "stale",
          status: "PENDING",
          expires_at: new Date(Date.now() - HOUR).toISOString(),
        },
      ],
      listings: [],
    });
    mockClient = db.client;

    // Force a sync throw on offers.select (only the first call though)
    const origFrom = db.client.from.bind(db.client);
    let calls = 0;
    db.client.from = (name: string) => {
      const b = origFrom(name);
      if (name === "offers" && calls++ === 0) {
        b.select = () => {
          throw new Error("[chaos] db down");
        };
        b.then = () => Promise.reject(new Error("[chaos] db down"));
      }
      return b;
    };

    const res = await GET(authedReq());
    expect(res.status).toBe(500);
    expect(db.state.offers[0].status).toBe("PENDING"); // untouched
  });
});
