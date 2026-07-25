/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";
import { basicScenario, IDS } from "@/test-utils/fixtures";

const getRequestUser = vi.fn();

vi.mock("@/lib/auth/api", () => ({
  getRequestUser: (...args: unknown[]) => getRequestUser(...args),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

let mockClient: any;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

import { GET } from "./route";

beforeEach(() => {
  getRequestUser.mockReset();
});

describe("GET /api/stripe-connect/payouts", () => {
  it("rejects unauthenticated callers", async () => {
    getRequestUser.mockResolvedValue({ user: null, source: null });
    const res = await GET(
      new Request("http://localhost/api/stripe-connect/payouts"),
    );
    expect(res.status).toBe(401);
  });

  it("returns payout history for Bearer-authenticated mobile users", async () => {
    getRequestUser.mockResolvedValue({
      user: { id: IDS.SELLER },
      source: "bearer",
    });

    const scenario = basicScenario();
    scenario.payouts = [
      {
        id: "payout-1",
        user_id: IDS.SELLER,
        amount: 50,
        currency: "EUR",
        status: "paid",
        requested_at: "2026-07-20T10:00:00.000Z",
      },
      {
        id: "payout-other",
        user_id: IDS.BUYER,
        amount: 10,
        currency: "EUR",
        status: "paid",
        requested_at: "2026-07-21T10:00:00.000Z",
      },
    ];
    const db = createMockDb(scenario);
    mockClient = db.client;

    const res = await GET(
      new Request("http://localhost/api/stripe-connect/payouts", {
        headers: { Authorization: "Bearer mobile-token" },
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.payouts).toHaveLength(1);
    expect(json.payouts[0].id).toBe("payout-1");
    expect(json.hasMore).toBe(false);
  });
});
