import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockDb } from "@/test-utils/db-mock";

let currentUser: { id: string; email?: string } | null = {
  id: "seller-1",
  email: "seller@example.com",
};
let mockClient: ReturnType<typeof createMockDb>["client"] | null = null;

vi.mock("@/lib/auth/api", () => ({
  getRequestUserClient: vi.fn(async () => ({
    user: currentUser,
    supabase: currentUser ? mockClient : null,
  })),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { GET } from "./route";

beforeEach(() => {
  currentUser = {
    id: "seller-1",
    email: "seller@example.com",
  };
});

describe("GET /api/stripe-connect/payouts", () => {
  it("returns the authenticated mobile user's payout history", async () => {
    const db = createMockDb({
      payouts: [
        {
          id: "payout-1",
          user_id: "seller-1",
          amount: 25,
          requested_at: "2026-07-18T12:00:00.000Z",
        },
        {
          id: "payout-other",
          user_id: "seller-2",
          amount: 99,
          requested_at: "2026-07-19T12:00:00.000Z",
        },
      ],
    });
    mockClient = db.client;

    const response = await GET(
      new Request("https://pokemarket.app/api/stripe-connect/payouts", {
        headers: { Authorization: "Bearer mobile-session" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.payouts).toEqual([
      expect.objectContaining({ id: "payout-1", user_id: "seller-1" }),
    ]);
  });

  it("rejects unauthenticated callers", async () => {
    currentUser = null;
    mockClient = null;

    const response = await GET(
      new Request("https://pokemarket.app/api/stripe-connect/payouts"),
    );

    expect(response.status).toBe(401);
  });
});
