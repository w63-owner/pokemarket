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
  return new Request("http://localhost/api/cron/release-expired", {
    method: "GET",
    headers: { authorization: "Bearer test_secret" },
  });
}

describe("cron/release-expired — auth", () => {
  it("rejects without bearer secret", async () => {
    mockClient = createMockDb({}).client;
    const res = await GET(
      new Request("http://localhost/api/cron/release-expired"),
    );
    expect(res.status).toBe(401);
  });
});

describe("cron/release-expired — QA", () => {
  it("PENDING_PAYMENT past expiration → EXPIRED + listing ACTIVE", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          listing_id: "L1",
          status: "PENDING_PAYMENT",
          expiration_date: new Date(Date.now() - HOUR).toISOString(),
        },
      ],
      listings: [{ id: "L1", status: "LOCKED" }],
      offers: [],
    });
    mockClient = db.client;
    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.released).toBe(1);
    expect(db.state.transactions[0].status).toBe("EXPIRED");
    expect(db.state.listings[0].status).toBe("ACTIVE");
  });

  it("with ACCEPTED offer present → listing reverts to RESERVED, not ACTIVE", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          listing_id: "L1",
          status: "PENDING_PAYMENT",
          expiration_date: new Date(Date.now() - HOUR).toISOString(),
        },
      ],
      listings: [{ id: "L1", status: "LOCKED" }],
      offers: [{ id: "o1", listing_id: "L1", status: "ACCEPTED" }],
    });
    mockClient = db.client;
    await GET(authedReq());
    expect(db.state.listings[0].status).toBe("RESERVED");
  });

  it("does not release transactions still within expiration window", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          listing_id: "L1",
          status: "PENDING_PAYMENT",
          expiration_date: new Date(Date.now() + HOUR).toISOString(),
        },
      ],
      listings: [{ id: "L1", status: "LOCKED" }],
      offers: [],
    });
    mockClient = db.client;
    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.released).toBe(0);
    expect(db.state.transactions[0].status).toBe("PENDING_PAYMENT");
    expect(db.state.listings[0].status).toBe("LOCKED");
  });

  it("does not touch listing if it is no longer LOCKED (race-safe)", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          listing_id: "L1",
          status: "PENDING_PAYMENT",
          expiration_date: new Date(Date.now() - HOUR).toISOString(),
        },
      ],
      // Listing already SOLD by another concurrent path
      listings: [{ id: "L1", status: "SOLD" }],
      offers: [],
    });
    mockClient = db.client;
    await GET(authedReq());
    // tx is marked EXPIRED, but listing keeps SOLD (the eq("status","LOCKED")
    // guard means the update affected 0 rows)
    expect(db.state.transactions[0].status).toBe("EXPIRED");
    expect(db.state.listings[0].status).toBe("SOLD");
  });

  it("returns {released: 0} when no expired transactions exist", async () => {
    const db = createMockDb({});
    mockClient = db.client;
    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.released).toBe(0);
  });
});

describe("cron/release-expired — STRESS", () => {
  it("releases 50 expired transactions in one run", async () => {
    const transactions = Array.from({ length: 50 }, (_, i) => ({
      id: `tx${i}`,
      listing_id: `L${i}`,
      status: "PENDING_PAYMENT",
      expiration_date: new Date(Date.now() - HOUR).toISOString(),
    }));
    const listings = Array.from({ length: 50 }, (_, i) => ({
      id: `L${i}`,
      status: "LOCKED",
    }));
    const db = createMockDb({ transactions, listings, offers: [] });
    mockClient = db.client;
    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.released).toBe(50);
    expect(db.state.transactions.every((t) => t.status === "EXPIRED")).toBe(
      true,
    );
    expect(db.state.listings.every((l) => l.status === "ACTIVE")).toBe(true);
  });
});
