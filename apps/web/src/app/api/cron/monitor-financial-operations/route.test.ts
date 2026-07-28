import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@/lib/financial-operations", () => ({
  getFinancialOperationsSnapshot: mocks.getSnapshot,
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
}));

import { GET } from "./route";

function request(secret = "test-secret") {
  return new Request("http://localhost/api/cron/monitor-financial-operations", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

const healthySnapshot = {
  stuckJobs: [],
  failedRecoveries: [],
  reconciliationAlerts: [],
  sellerDebts: [],
  pendingRefunds: [],
  evidenceDueSoon: [],
  failedPayouts: [],
};

describe("financial operations monitor", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    vi.clearAllMocks();
    mocks.getSnapshot.mockResolvedValue(healthySnapshot);
  });

  it("rejects an invalid cron secret", async () => {
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(mocks.getSnapshot).not.toHaveBeenCalled();
  });

  it("reports a healthy snapshot without creating an alert", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ healthy: true });
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });

  it("groups critical financial signals into a Sentry alert", async () => {
    mocks.getSnapshot.mockResolvedValue({
      ...healthySnapshot,
      stuckJobs: [{ id: "job-1" }],
      evidenceDueSoon: [{ id: "dp-1" }],
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      healthy: false,
      stuck_jobs: 1,
      evidence_due_soon: 1,
    });
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      "Financial operations require intervention",
      expect.objectContaining({ level: "error" }),
    );
  });
});
