/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let currentUser: { id: string; email?: string } | null = {
  id: "seller-1",
  email: "seller@example.com",
};

vi.mock("@/lib/auth/api", () => ({
  getRequestUser: vi.fn(async () => ({
    user: currentUser,
    source: "bearer" as const,
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

function req(cursor?: string) {
  const url = new URL("http://localhost/api/stripe-connect/payouts");
  if (cursor) url.searchParams.set("cursor", cursor);
  return new Request(url.toString(), {
    headers: { authorization: "Bearer mobile-token" },
  });
}

describe("GET /api/stripe-connect/payouts", () => {
  it("rejects unauthenticated callers", async () => {
    currentUser = null;
    mockClient = createMockDb({}).client;

    const res = await GET(req());

    expect(res.status).toBe(401);
  });

  it("returns only the authenticated user's payout history", async () => {
    const db = createMockDb({
      payouts: [
        {
          id: "payout-1",
          user_id: "seller-1",
          amount: 50,
          currency: "EUR",
          status: "paid",
          requested_at: "2026-07-10T10:00:00.000Z",
        },
        {
          id: "payout-other",
          user_id: "seller-2",
          amount: 75,
          currency: "EUR",
          status: "paid",
          requested_at: "2026-07-10T11:00:00.000Z",
        },
      ],
    });
    mockClient = db.client;

    const res = await GET(req());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.payouts).toHaveLength(1);
    expect(json.payouts[0].id).toBe("payout-1");
    expect(json.hasMore).toBe(false);
  });
});
