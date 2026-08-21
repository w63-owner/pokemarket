import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type QueryResult = {
  data: unknown;
  error: unknown;
};

const results: Record<string, QueryResult> = {};

function queryBuilder(result: QueryResult) {
  const builder = {
    eq: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };

  [builder.eq, builder.limit, builder.order, builder.select].forEach((method) =>
    method.mockReturnValue(builder),
  );
  builder.maybeSingle.mockResolvedValue(result);
  return builder;
}

const from = vi.fn((table: string) => queryBuilder(results[table]));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { computePriceHistoryStats, GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  results.tcgdex_cards = {
    data: {
      pricing: {
        cardmarket: { unit: "EUR", trend: 42 },
      },
    },
    error: null,
  };
  results.listings = { data: [], error: null };
  results.card_price_history = {
    data: [
      {
        currency: "EUR",
        price: 40,
        snapshot_date: new Date().toISOString().slice(0, 10),
      },
    ],
    error: null,
  };
});

describe("GET /api/cards/[card_key]/price-history", () => {
  it("returns only real snapshots and a cacheable construction state", async () => {
    const response = await GET(
      new NextRequest(
        "https://pokemarket.test/api/cards/fr-base1-4/price-history?variant=normal&period=30d",
      ),
      { params: Promise.resolve({ card_key: "fr-base1-4" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
    await expect(response.json()).resolves.toMatchObject({
      chartData: [
        {
          price: 40,
        },
      ],
      historyStatus: "single",
      period: "30d",
      source: "CARDMARKET_TCGDEX",
      variant: "normal",
    });
  });

  it("rejects incompatible market dimensions", async () => {
    const response = await GET(
      new NextRequest(
        "https://pokemarket.test/api/cards/fr-base1-4/price-history?variant=reverse",
      ),
      { params: Promise.resolve({ card_key: "fr-base1-4" }) },
    );

    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("computePriceHistoryStats", () => {
  it("computes statistics from observations without extrapolation", () => {
    expect(
      computePriceHistoryStats([
        { date: "2026-08-20", price: 10 },
        { date: "2026-08-21", price: 20 },
      ]),
    ).toEqual({
      range: [10, 20],
      observations: 2,
      volatility: 33.3,
    });
  });

  it("returns an explicit empty state", () => {
    expect(computePriceHistoryStats([])).toEqual({
      range: null,
      observations: 0,
      volatility: 0,
    });
  });
});
