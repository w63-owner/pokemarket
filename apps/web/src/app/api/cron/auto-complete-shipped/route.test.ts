/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

vi.mock("@/lib/push/send", () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications/outbox", () => ({
  enqueueNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET } from "./route";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  process.env.CRON_SECRET = "test_secret";
  vi.clearAllMocks();
});

function authedReq() {
  return new Request("http://localhost/api/cron/auto-complete-shipped", {
    method: "GET",
    headers: { authorization: "Bearer test_secret" },
  });
}

describe("cron/auto-complete-shipped — auth", () => {
  it("rejects without bearer secret", async () => {
    mockClient = createMockDb({}).client;
    const res = await GET(
      new Request("http://localhost/api/cron/auto-complete-shipped"),
    );
    expect(res.status).toBe(401);
  });
});

describe("cron/auto-complete-shipped — QA", () => {
  it("SHIPPED transaction past 14 days → COMPLETED + escrow released", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          buyer_id: "buyer1",
          seller_id: "seller1",
          listing_id: "L1",
          listing_title: "Pikachu V",
          conversation_id: "conv1",
          status: "SHIPPED",
          shipped_at: new Date(Date.now() - 15 * DAY).toISOString(),
          total_amount: 25.0,
          fee_amount: 2.5,
          shipping_cost: 2.49,
        },
      ],
      wallets: [
        { user_id: "seller1", pending_balance: 20.01, available_balance: 0 },
      ],
      messages: [],
    });
    mockClient = db.client;

    const res = await GET(authedReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.auto_completed).toBe(1);
    expect(db.state.transactions[0].status).toBe("COMPLETED");
    expect(db.state.wallets[0].pending_balance).toBe(0);
    expect(db.state.wallets[0].available_balance).toBe(20.01);
  });

  it("does not auto-complete transactions shipped less than 14 days ago", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          buyer_id: "buyer1",
          seller_id: "seller1",
          listing_id: "L1",
          status: "SHIPPED",
          shipped_at: new Date(Date.now() - 10 * DAY).toISOString(),
          total_amount: 25.0,
          fee_amount: 2.5,
          shipping_cost: 2.49,
        },
      ],
      wallets: [
        { user_id: "seller1", pending_balance: 20.01, available_balance: 0 },
      ],
    });
    mockClient = db.client;

    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.auto_completed).toBe(0);
    expect(db.state.transactions[0].status).toBe("SHIPPED");
  });

  it("returns {auto_completed: 0} when no eligible transactions", async () => {
    const db = createMockDb({});
    mockClient = db.client;
    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.auto_completed).toBe(0);
  });

  it("skips already-completed transactions (status guard)", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          buyer_id: "buyer1",
          seller_id: "seller1",
          status: "COMPLETED",
          shipped_at: new Date(Date.now() - 15 * DAY).toISOString(),
        },
      ],
    });
    mockClient = db.client;

    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.auto_completed).toBe(0);
  });

  it("inserts system message in conversation", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          buyer_id: "buyer1",
          seller_id: "seller1",
          listing_id: "L1",
          conversation_id: "conv1",
          status: "SHIPPED",
          shipped_at: new Date(Date.now() - 15 * DAY).toISOString(),
          total_amount: 25.0,
          fee_amount: 2.5,
          shipping_cost: 2.49,
        },
      ],
      wallets: [
        { user_id: "seller1", pending_balance: 20.01, available_balance: 0 },
      ],
      messages: [],
    });
    mockClient = db.client;

    await GET(authedReq());
    expect(db.state.messages.length).toBe(1);
    expect(db.state.messages[0].message_type).toBe("sale_auto_completed");
    expect(db.state.messages[0].metadata.auto_completed).toBe(true);
  });
});

describe("cron/auto-complete-shipped — STRESS", () => {
  it("auto-completes 30 transactions in one run", async () => {
    const transactions = Array.from({ length: 30 }, (_, i) => ({
      id: `tx${i}`,
      buyer_id: `buyer${i}`,
      seller_id: `seller${i}`,
      listing_id: `L${i}`,
      status: "SHIPPED",
      shipped_at: new Date(Date.now() - 15 * DAY).toISOString(),
      total_amount: 20.0,
      fee_amount: 1.7,
      shipping_cost: 2.49,
    }));
    const wallets = Array.from({ length: 30 }, (_, i) => ({
      user_id: `seller${i}`,
      pending_balance: 15.81,
      available_balance: 0,
    }));
    const db = createMockDb({ transactions, wallets, messages: [] });
    mockClient = db.client;

    const res = await GET(authedReq());
    const json = await res.json();
    expect(json.auto_completed).toBe(30);
    expect(db.state.transactions.every((t) => t.status === "COMPLETED")).toBe(
      true,
    );
    expect(
      db.state.wallets.every(
        (w) => w.pending_balance === 0 && w.available_balance === 15.81,
      ),
    ).toBe(true);
  });
});

describe("cron/auto-complete-shipped — edge cases", () => {
  it("handles RPC error gracefully and continues with other transactions", async () => {
    const db = createMockDb({
      transactions: [
        {
          id: "tx1",
          buyer_id: "buyer1",
          seller_id: "seller1",
          status: "SHIPPED",
          shipped_at: new Date(Date.now() - 15 * DAY).toISOString(),
          total_amount: 25.0,
          fee_amount: 2.5,
          shipping_cost: 2.49,
        },
        {
          id: "tx2",
          buyer_id: "buyer2",
          seller_id: "seller2",
          status: "SHIPPED",
          shipped_at: new Date(Date.now() - 15 * DAY).toISOString(),
          total_amount: 30.0,
          fee_amount: 2.2,
          shipping_cost: 2.49,
        },
      ],
      wallets: [
        { user_id: "seller1", pending_balance: 0, available_balance: 0 },
        { user_id: "seller2", pending_balance: 25.31, available_balance: 0 },
      ],
      messages: [],
    });
    mockClient = db.client;

    const res = await GET(authedReq());
    const json = await res.json();

    expect(json.auto_completed).toBe(1);
    expect(json.total_eligible).toBe(2);
    expect(db.state.transactions[1].status).toBe("COMPLETED");
  });
});
