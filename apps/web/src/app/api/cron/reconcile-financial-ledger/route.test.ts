/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockDb } from "@/test-utils/db-mock";

const mocks = vi.hoisted(() => ({
  client: null as any,
  processPaidTransactionEffects: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.client,
}));

vi.mock("@/lib/stripe/post-payment", () => ({
  processPaidTransactionEffects: mocks.processPaidTransactionEffects,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { GET } from "./route";

function request(secret = "test-secret") {
  return new Request("http://localhost/api/cron/reconcile-financial-ledger", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

function financialJob() {
  return {
    id: "job-1",
    event_type: "payment_finalized",
    aggregate_id: "tx-1",
    idempotency_key: "payment-finalized:tx-1",
    status: "PENDING",
    attempts: 0,
    max_attempts: 12,
    next_attempt_at: new Date(Date.now() - 1_000).toISOString(),
    lease_token: null,
    lease_expires_at: null,
  };
}

describe("cron/reconcile-financial-ledger", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    mocks.processPaidTransactionEffects.mockReset();
  });

  it("rejects an invalid cron secret", async () => {
    mocks.client = createMockDb({}).client;

    const response = await GET(request("wrong"));

    expect(response.status).toBe(401);
  });

  it("fails closed when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;
    mocks.client = createMockDb({}).client;

    const response = await GET(request("undefined"));

    expect(response.status).toBe(401);
  });

  it("claims, processes, and acknowledges payment effects", async () => {
    const db = createMockDb({ financial_outbox: [financialJob()] });
    mocks.client = db.client;

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      processed: 1,
      completed: 1,
      failed: 0,
    });
    expect(mocks.processPaidTransactionEffects).toHaveBeenCalledWith("tx-1");
    expect(db.state.financial_outbox[0].status).toBe("COMPLETED");
  });

  it("releases a failed job for retry with its lease token", async () => {
    const db = createMockDb({ financial_outbox: [financialJob()] });
    mocks.client = db.client;
    mocks.processPaidTransactionEffects.mockRejectedValueOnce(
      new Error("temporary failure"),
    );

    const response = await GET(request());

    await expect(response.json()).resolves.toEqual({
      processed: 1,
      completed: 0,
      failed: 1,
    });
    expect(db.state.financial_outbox[0]).toMatchObject({
      status: "PENDING",
      attempts: 1,
      last_error: "temporary failure",
      lease_token: null,
    });
  });
});
