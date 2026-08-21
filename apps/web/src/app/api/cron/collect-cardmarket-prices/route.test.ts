import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  collect: vi.fn(),
  setContext: vi.fn(),
  setMeasurement: vi.fn(),
}));

vi.mock("@/lib/cardmarket/collector", () => ({
  collectCardmarketPriceBatch: mocks.collect,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
  setContext: mocks.setContext,
  setMeasurement: mocks.setMeasurement,
}));

import { GET } from "./route";

function request(secret?: string) {
  return new Request(
    "https://pokemarket.test/api/cron/collect-cardmarket-prices",
    {
      headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  mocks.collect.mockResolvedValue({
    batch_size: 150,
    completed: false,
    coverage_percent: 42.5,
    failed: 0,
    next_cursor: "fr-sv08-100",
    priced: 142,
    processed: 1500,
    snapshot_date: "2026-08-21",
    total: 3529,
  });
});

describe("GET /api/cron/collect-cardmarket-prices", () => {
  it("fails closed when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer token", async () => {
    const response = await GET(request("wrong-secret"));

    expect(response.status).toBe(401);
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("returns resumable collection and coverage metrics", async () => {
    const response = await GET(request("test-secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        coverage_percent: 42.5,
        next_cursor: "fr-sv08-100",
      }),
    );
    expect(mocks.setMeasurement).toHaveBeenCalledWith(
      "cardmarket.collection_coverage",
      42.5,
      "percent",
    );
  });

  it("reports partial batches to Sentry", async () => {
    mocks.collect.mockResolvedValue({
      batch_size: 150,
      completed: false,
      coverage_percent: 42.5,
      failed: 2,
      next_cursor: "fr-sv08-100",
      priced: 140,
      processed: 1500,
      snapshot_date: "2026-08-21",
      total: 3529,
    });

    await GET(request("test-secret"));

    expect(mocks.captureMessage).toHaveBeenCalledWith(
      "Cardmarket daily collection has failed cards",
      expect.objectContaining({ level: "warning" }),
    );
  });
});
