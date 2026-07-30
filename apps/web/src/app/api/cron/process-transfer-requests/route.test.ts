/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockDb } from "@/test-utils/db-mock";

const mocks = vi.hoisted(() => ({
  client: null as any,
  executeFinancialRecovery: vi.fn(),
  executeSellerTransfer: vi.fn(),
  executeReservedPayout: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.client,
}));
vi.mock("@/lib/stripe/execute-transfer", () => ({
  executeSellerTransfer: mocks.executeSellerTransfer,
}));
vi.mock("@/lib/stripe/execute-financial-recovery", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/stripe/execute-financial-recovery")
  >("@/lib/stripe/execute-financial-recovery");
  return {
    ...actual,
    executeFinancialRecovery: mocks.executeFinancialRecovery,
  };
});
vi.mock("@/lib/stripe/execute-payout", () => ({
  executeReservedPayout: mocks.executeReservedPayout,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET } from "./route";

function request(secret = "test-secret") {
  return new Request("http://localhost/api/cron/process-transfer-requests", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

function transferJob() {
  return {
    id: "job-transfer-1",
    event_type: "transfer_requested",
    aggregate_id: "tx-1",
    idempotency_key: "transfer-requested:tx-1",
    status: "PENDING",
    attempts: 0,
    max_attempts: 12,
    next_attempt_at: new Date(Date.now() - 1_000).toISOString(),
    lease_token: null,
    lease_expires_at: null,
  };
}

describe("cron/process-transfer-requests", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    mocks.executeSellerTransfer.mockReset();
    mocks.executeFinancialRecovery.mockReset();
    mocks.executeReservedPayout.mockReset();
  });

  it("claims and acknowledges a per-order transfer job", async () => {
    const db = createMockDb({ financial_outbox: [transferJob()] });
    mocks.client = db.client;

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.executeSellerTransfer).toHaveBeenCalledWith("tx-1");
    expect(db.state.financial_outbox[0].status).toBe("COMPLETED");
    await expect(response.json()).resolves.toMatchObject({
      processed: 1,
      completed: 1,
      failed: 0,
    });
  });

  it("releases a failed transfer job for deterministic retry", async () => {
    const db = createMockDb({ financial_outbox: [transferJob()] });
    mocks.client = db.client;
    mocks.executeSellerTransfer.mockRejectedValueOnce(
      new Error("temporary Stripe failure"),
    );

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(db.state.financial_outbox[0]).toMatchObject({
      status: "PENDING",
      attempts: 1,
      last_error: "temporary Stripe failure",
      lease_token: null,
    });
  });

  it("executes a durable transfer reversal recovery", async () => {
    const db = createMockDb({
      financial_outbox: [
        {
          ...transferJob(),
          id: "job-recovery-1",
          event_type: "transfer_reversal_requested",
          payload: { recovery_id: "recovery-1" },
        },
      ],
    });
    mocks.client = db.client;

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.executeFinancialRecovery).toHaveBeenCalledWith("recovery-1");
    expect(db.state.financial_outbox[0].status).toBe("COMPLETED");
  });

  it("abandons recovery into seller debt when outbox retries are exhausted", async () => {
    const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> =
      [];
    const db = createMockDb({
      financial_outbox: [
        {
          ...transferJob(),
          id: "job-recovery-fail",
          event_type: "transfer_reversal_requested",
          payload: { recovery_id: "recovery-fail" },
          attempts: 11,
          max_attempts: 12,
        },
      ],
    });
    const originalRpc = db.client.rpc.bind(db.client);
    db.client.rpc = async (name: string, params: Record<string, unknown>) => {
      rpcCalls.push({ name, params });
      return originalRpc(name, params);
    };
    mocks.client = db.client;
    mocks.executeFinancialRecovery.mockRejectedValueOnce(
      new Error("insufficient_funds"),
    );

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(db.state.financial_outbox[0].status).toBe("FAILED");
    expect(rpcCalls).toContainEqual({
      name: "abandon_financial_recovery",
      params: {
        p_recovery_id: "recovery-fail",
        p_error: "insufficient_funds",
      },
    });
  });

  it("does not auto-debt on ambiguous terminal recovery failures", async () => {
    const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> =
      [];
    const db = createMockDb({
      financial_outbox: [
        {
          ...transferJob(),
          id: "job-recovery-net",
          event_type: "transfer_reversal_requested",
          payload: { recovery_id: "recovery-net" },
          attempts: 11,
          max_attempts: 12,
        },
      ],
    });
    const originalRpc = db.client.rpc.bind(db.client);
    db.client.rpc = async (name: string, params: Record<string, unknown>) => {
      rpcCalls.push({ name, params });
      return originalRpc(name, params);
    };
    mocks.client = db.client;
    mocks.executeFinancialRecovery.mockRejectedValueOnce(
      new Error("socket hang up"),
    );

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(db.state.financial_outbox[0].status).toBe("FAILED");
    expect(
      rpcCalls.some((call) => call.name === "abandon_financial_recovery"),
    ).toBe(false);
  });

  it("retries a durable pending bank payout", async () => {
    const db = createMockDb({
      payouts: [
        {
          id: "payout-1",
          status: "pending",
          requested_at: "2026-07-01T00:00:00.000Z",
        },
      ],
    });
    mocks.client = db.client;

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.executeReservedPayout).toHaveBeenCalledWith("payout-1");
    await expect(response.json()).resolves.toMatchObject({
      payoutsReconciled: 1,
      payoutsFailed: 0,
    });
  });
});
