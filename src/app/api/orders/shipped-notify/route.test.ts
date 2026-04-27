/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let currentUser: { id: string } | null = { id: "seller-1" };
let mockClient: any;

const sentEmails: any[] = [];
const sentPushes: any[] = [];

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
vi.mock("@/lib/emails/send", () => ({
  sendEmail: vi.fn(async (to: string, subject: string) => {
    sentEmails.push({ to, subject });
  }),
}));
vi.mock("@/lib/push/send", () => ({
  sendPushNotification: vi.fn(
    async (userId: string, title: string, body: string, url: string) => {
      sentPushes.push({ userId, title, body, url });
    },
  ),
}));
vi.mock("@/emails/order-shipped", () => ({ default: () => null }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "./route";

beforeEach(() => {
  sentEmails.length = 0;
  sentPushes.length = 0;
  currentUser = { id: "seller-1" };
});

function makeReq(body: any) {
  return new Request("http://localhost/api/orders/shipped-notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function scenario() {
  return {
    transactions: [
      {
        id: "tx1",
        seller_id: "seller-1",
        buyer_id: "buyer-1",
        listing_id: "L1",
        status: "SHIPPED",
        tracking_number: "TRACK-123",
        tracking_url: "https://track.example/TRACK-123",
      },
    ],
    listings: [{ id: "L1", title: "Charizard" }],
    profiles: [{ id: "buyer-1", username: "bob" }],
    conversations: [
      {
        id: "conv-1",
        listing_id: "L1",
        buyer_id: "buyer-1",
        seller_id: "seller-1",
      },
    ],
    users: [{ id: "buyer-1", email: "buyer@example.com" }],
  };
}

describe("orders/shipped-notify — QA", () => {
  it("sends both email and push to buyer", async () => {
    const db = createMockDb(scenario());
    mockClient = db.client;
    const res = await POST(makeReq({ transaction_id: "tx1" }));
    expect(res.status).toBe(200);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe("buyer@example.com");
    expect(sentPushes).toHaveLength(1);
    expect(sentPushes[0].userId).toBe("buyer-1");
    expect(sentPushes[0].url).toBe("/messages/conv-1");
  });

  it("rejects unauthenticated", async () => {
    currentUser = null;
    mockClient = createMockDb(scenario()).client;
    const res = await POST(makeReq({ transaction_id: "tx1" }));
    expect(res.status).toBe(401);
  });

  it("rejects when transaction_id missing", async () => {
    mockClient = createMockDb(scenario()).client;
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("rejects when transaction does not belong to seller", async () => {
    const sc = scenario();
    sc.transactions[0].seller_id = "other-seller";
    mockClient = createMockDb(sc).client;
    const res = await POST(makeReq({ transaction_id: "tx1" }));
    expect(res.status).toBe(404);
  });

  it("rejects when transaction is not in SHIPPED status", async () => {
    const sc = scenario();
    sc.transactions[0].status = "PAID";
    mockClient = createMockDb(sc).client;
    const res = await POST(makeReq({ transaction_id: "tx1" }));
    expect(res.status).toBe(404);
  });

  it("falls back to /orders/<id> deep link when no conversation exists", async () => {
    const sc = scenario();
    sc.conversations = [];
    mockClient = createMockDb(sc).client;
    await POST(makeReq({ transaction_id: "tx1" }));
    expect(sentPushes[0].url).toBe("/orders/tx1");
  });

  it("still sends push even if buyer has no email", async () => {
    const sc = scenario();
    sc.users[0].email = undefined as any;
    mockClient = createMockDb(sc).client;
    const res = await POST(makeReq({ transaction_id: "tx1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.email).toBe(false);
    expect(sentEmails).toHaveLength(0);
    expect(sentPushes).toHaveLength(1); // push still went out
  });
});
