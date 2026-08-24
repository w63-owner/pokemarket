import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  data: Record<string, unknown> | null;
  error: Error | null;
};

const rows: Record<string, QueryResult> = {};
const from = vi.fn((table: string) => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => rows[table]),
      })),
    })),
  })),
}));

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ from }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  rows.tcgdex_cards = {
    data: {
      card_key: "fr-base1-4",
      language: "fr",
      name: "Dracaufeu",
      set_id: "base1",
      local_id: "4",
      rarity: "Rare",
      illustrator: "Mitsuhiro Arita",
      variants: { normal: true, holo: true },
      pricing: {
        cardmarket: {
          updated: "2026-08-20T00:00:00.000Z",
          unit: "EUR",
          trend: 210,
          avg: 205,
          avg30: 198,
          "trend-holo": 350,
          "avg-holo": 340,
          "avg30-holo": 320,
        },
      },
    },
    error: null,
  };
  rows.tcgdex_sets = {
    data: {
      id: "base1",
      name: "Set de Base",
      series_id: "base",
      card_count: { official: 102 },
    },
    error: null,
  };
  rows.tcgdex_series = {
    data: { id: "base", name: "Base" },
    error: null,
  };
});

describe("GET /api/cards/[card_key]", () => {
  it("rejects card keys outside the French catalog contract", async () => {
    const response = await GET(new Request("https://thedeckdealr.test"), {
      params: Promise.resolve({ card_key: "../secret" }),
    });

    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns parsed normal and holo quotes with cache headers", async () => {
    const response = await GET(new Request("https://thedeckdealr.test"), {
      params: Promise.resolve({ card_key: "fr-base1-4" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=1800");
    await expect(response.json()).resolves.toEqual({
      card: expect.objectContaining({
        card_key: "fr-base1-4",
        name: "Dracaufeu",
        set_name: "Set de Base",
        series_name: "Base",
        set_official_count: 102,
        available_variants: ["normal", "holo"],
        image_url: "https://assets.tcgdex.net/fr/base/base1/4/high.webp",
        pricing: expect.objectContaining({
          source: "cardmarket",
          normal: expect.objectContaining({ current: 210, average30: 198 }),
          holo: expect.objectContaining({ current: 350, average30: 320 }),
        }),
      }),
    });
  });

  it("returns 404 without fabricating a quote", async () => {
    rows.tcgdex_cards = { data: null, error: null };

    const response = await GET(new Request("https://thedeckdealr.test"), {
      params: Promise.resolve({ card_key: "fr-missing-1" }),
    });

    expect(response.status).toBe(404);
  });
});
