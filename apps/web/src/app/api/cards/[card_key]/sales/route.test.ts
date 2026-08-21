import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ rpc }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { GET } from "./route";

function request(variant = "holo") {
  return new NextRequest(
    `https://pokemarket.test/api/cards/fr-base1-4/sales?variant=${variant}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({
    data: [
      {
        median_price: 98.5,
        average_price: 101.25,
        sales_volume: 4,
        last_sold_at: "2026-08-20T10:00:00.000Z",
        recent_sales: [
          {
            price: 102,
            sold_at: "2026-08-20T10:00:00.000Z",
            variant: "holo",
          },
        ],
      },
    ],
    error: null,
  });
});

describe("GET /api/cards/[card_key]/sales", () => {
  it("returns anonymised real-sale aggregates with short CDN caching", async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ card_key: "fr-base1-4" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(rpc).toHaveBeenCalledWith("get_pokemarket_sales_summary", {
      p_card_key: "fr-base1-4",
      p_variant: "holo",
      p_limit: 12,
    });
    await expect(response.json()).resolves.toEqual({
      median_price: 98.5,
      average_price: 101.25,
      sales_volume: 4,
      last_sold_at: "2026-08-20T10:00:00.000Z",
      recent_sales: [
        {
          price: 102,
          sold_at: "2026-08-20T10:00:00.000Z",
          variant: "holo",
        },
      ],
      has_sufficient_volume: true,
      minimum_volume: 3,
      currency: "EUR",
    });
  });

  it("returns a pedagogical low-volume state without inventing prices", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          median_price: null,
          average_price: null,
          sales_volume: 0,
          last_sold_at: null,
          recent_sales: [],
        },
      ],
      error: null,
    });

    const response = await GET(request("normal"), {
      params: Promise.resolve({ card_key: "fr-base1-4" }),
    });

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        median_price: null,
        sales_volume: 0,
        has_sufficient_volume: false,
        recent_sales: [],
      }),
    );
  });

  it("rejects invalid variants before querying the database", async () => {
    const response = await GET(request("reverse"), {
      params: Promise.resolve({ card_key: "fr-base1-4" }),
    });

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a controlled error when aggregation fails", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("database down") });

    const response = await GET(request(), {
      params: Promise.resolve({ card_key: "fr-base1-4" }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Les ventes PokeMarket sont momentanément indisponibles.",
    });
  });
});
