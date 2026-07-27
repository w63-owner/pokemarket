/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockDb } from "@/test-utils/db-mock";

const mocks = vi.hoisted(() => ({
  client: null as any,
  executeSellerTransfer: vi.fn(),
  executeReservedPayout: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.client,
}));
vi.mock("@/lib/stripe/execute-transfer", () => ({
  executeSellerTransfer: mocks.executeSellerTransfer,
}));
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
