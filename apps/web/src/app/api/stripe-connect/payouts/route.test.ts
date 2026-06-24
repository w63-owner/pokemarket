/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let currentUser: { id: string; email?: string } | null = {
  id: "seller-1",
  email: "seller@example.com",
};

vi.mock("@/lib/auth/api", () => ({
  getRequestUser: vi.fn(async () => ({
    user: currentUser,
    source: currentUser ? ("bearer" as const) : null,
  })),
}));

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET } from "./route";

beforeEach(() => {
  currentUser = { id: "seller-1", email: "seller@example.com" };
  vi.clearAllMocks();
});

function req(url = "http://localhost/api/stripe-connect/payouts") {
  return new Request(url, {
    headers: { authorization: "Bearer jwt" },
  });
}

describe("stripe-connect/payouts", () => {
  it("rejects anonymous callers", async () => {
    currentUser = null;
    mockClient = createMockDb({}).client;

    const res = await GET(req());

    expect(res.status).toBe(401);
  });

  it("returns only the authenticated seller's payout history for bearer callers", async () => {
    mockClient = createMockDb({
      payouts: [
        {
          id: "payout-own-new",
          user_id: "seller-1",
          amount: 40,
          status: "paid",
          requested_at: "2026-06-24T10:00:00.000Z",
        },
        {
          id: "payout-other",
          user_id: "seller-2",
          amount: 999,
          status: "paid",
          requested_at: "2026-06-24T11:00:00.000Z",
        },
        {
          id: "payout-own-old",
          user_id: "seller-1",
          amount: 25,
          status: "failed",
          requested_at: "2026-06-23T10:00:00.000Z",
        },
      ],
    }).client;

    const res = await GET(req());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.payouts.map((payout: { id: string }) => payout.id)).toEqual([
      "payout-own-new",
      "payout-own-old",
    ]);
    expect(json.hasMore).toBe(false);
  });
});
