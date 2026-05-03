/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb } from "@/test-utils/db-mock";

let currentUser: { id: string; email?: string } | null = {
  id: "admin-1",
  email: "admin@example.com",
};
let mockClient: any;
let mockSupabaseClient: any;

const refundCreate = vi.fn(async (params: any) => ({
  id: `re_test_${Date.now()}`,
  status: "succeeded",
  amount: params.amount,
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    refunds: { create: refundCreate },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mockSupabaseClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockClient,
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(async () => null),
  adminMutationRateLimit: {} as any,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { POST } from "./route";

const TX_ID = "11111111-1111-4111-8111-111111111111";

function paidScenario({
  role = "admin",
  status = "PAID",
  paymentIntentId = "pi_test_1",
  refundedAmount = 0,
}: {
  role?: "admin" | "user";
  status?: string;
  paymentIntentId?: string | null;
  refundedAmount?: number;
} = {}) {
  return {
    profiles: [{ id: currentUser?.id, role }],
    transactions: [
      {
        id: TX_ID,
        status,
        total_amount: 100,
        refunded_amount: refundedAmount,
        stripe_payment_intent_id: paymentIntentId,
        stripe_charge_id: "ch_test_1",
        buyer_id: "buyer-1",
        seller_id: "seller-1",
      },
    ],
  };
}

beforeEach(() => {
  currentUser = { id: "admin-1", email: "admin@example.com" };
  refundCreate.mockClear();
});

function buildSupabaseMock() {
  // Lightweight client used by requireAdmin: only auth.getUser + profile.role
  return {
    auth: {
      getUser: async () => ({ data: { user: currentUser }, error: null }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            const profile = (mockClient.__state ?? {}).profiles?.find(
              (p: any) => p.id === currentUser?.id,
            );
            if (table === "profiles") {
              return { data: profile, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
    }),
  };
}

function makeReq(body: any) {
  return new Request("http://localhost/api/admin/refund", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupDb(scenario: ReturnType<typeof paidScenario>) {
  const db = createMockDb(scenario);
  mockClient = db.client;
  mockClient.__state = db.state;
  mockSupabaseClient = buildSupabaseMock();
  return db;
}

describe("admin/refund — auth", () => {
  it("rejects unauthenticated", async () => {
    currentUser = null;
    setupDb(paidScenario());
    const res = await POST(
      makeReq({
        transaction_id: TX_ID,
        reason: "duplicate",
        internal_note: "doubled-charged",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects non-admin", async () => {
    setupDb(paidScenario({ role: "user" }));
    const res = await POST(
      makeReq({
        transaction_id: TX_ID,
        reason: "duplicate",
        internal_note: "doubled-charged",
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("admin/refund — validation", () => {
  it("rejects invalid body", async () => {
    setupDb(paidScenario());
    const res = await POST(makeReq({ transaction_id: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("rejects unknown transaction", async () => {
    setupDb(paidScenario());
    const res = await POST(
      makeReq({
        transaction_id: "22222222-2222-4222-8222-222222222222",
        reason: "duplicate",
        internal_note: "doubled-charged",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("rejects refund on EXPIRED transaction", async () => {
    setupDb(paidScenario({ status: "EXPIRED" }));
    const res = await POST(
      makeReq({
        transaction_id: TX_ID,
        reason: "requested_by_customer",
        internal_note: "buyer-changed-mind",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects refund without payment_intent_id", async () => {
    setupDb(paidScenario({ paymentIntentId: null }));
    const res = await POST(
      makeReq({
        transaction_id: TX_ID,
        reason: "duplicate",
        internal_note: "lost-stripe-id",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects amount above remaining refundable", async () => {
    setupDb(paidScenario({ refundedAmount: 80 }));
    const res = await POST(
      makeReq({
        transaction_id: TX_ID,
        amount: 50, // remaining is 20
        reason: "duplicate",
        internal_note: "boundary-test",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("admin/refund — happy path", () => {
  it("issues full refund via Stripe + audit log written", async () => {
    const db = setupDb(paidScenario());
    const res = await POST(
      makeReq({
        transaction_id: TX_ID,
        reason: "duplicate",
        internal_note: "buyer-charged-twice",
      }),
    );
    expect(res.status).toBe(200);

    expect(refundCreate).toHaveBeenCalledTimes(1);
    const params = refundCreate.mock.calls[0][0];
    expect(params.amount).toBe(10000); // 100 EUR
    expect(params.reason).toBe("duplicate");

    const audit = db.state.admin_audit_log.find(
      (a) => a.target_id === TX_ID && a.action === "refund.create",
    );
    expect(audit).toBeDefined();
  });

  it("issues partial refund matching the requested amount", async () => {
    setupDb(paidScenario({ refundedAmount: 30 }));
    const res = await POST(
      makeReq({
        transaction_id: TX_ID,
        amount: 25,
        reason: "requested_by_customer",
        internal_note: "partial-refund-test",
      }),
    );
    expect(res.status).toBe(200);
    const params = refundCreate.mock.calls[0][0];
    expect(params.amount).toBe(2500);
  });
});
