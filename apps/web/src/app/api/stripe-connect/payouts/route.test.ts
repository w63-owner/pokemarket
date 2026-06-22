/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let mockClient: any;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

vi.mock("@/lib/auth/api", () => ({
  getRequestUser: vi.fn(async (request: Request) => {
    const auth = request.headers.get("authorization");
    return {
      user:
        auth === "Bearer mobile-token"
          ? { id: "seller-1", email: "seller@example.com" }
          : null,
      source: auth === "Bearer mobile-token" ? "bearer" : null,
    };
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/stripe-connect/payouts", () => {
  it("accepts mobile Bearer auth and returns only the caller payout history", async () => {
    const db = createMockDb({
      payouts: [
        {
          id: "payout-1",
          user_id: "seller-1",
          amount: 20,
          currency: "EUR",
          status: "paid",
          requested_at: "2026-06-21T10:00:00.000Z",
        },
        {
          id: "payout-2",
          user_id: "other-seller",
          amount: 999,
          currency: "EUR",
          status: "paid",
          requested_at: "2026-06-22T10:00:00.000Z",
        },
      ],
    });
    mockClient = db.client;

    const res = await GET(
      new Request("http://localhost/api/stripe-connect/payouts", {
        headers: { authorization: "Bearer mobile-token" },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.payouts).toHaveLength(1);
    expect(json.payouts[0].id).toBe("payout-1");
  });

  it("rejects unauthenticated requests", async () => {
    mockClient = createMockDb({}).client;

    const res = await GET(
      new Request("http://localhost/api/stripe-connect/payouts"),
    );

    expect(res.status).toBe(401);
  });
});
