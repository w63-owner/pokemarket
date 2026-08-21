import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ rpc }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({
    data: [
      {
        rank: 1,
        card_key: "fr-base1-4",
        card_name: "Dracaufeu",
        card_set_id: "base1",
        set_name: "Set de Base",
        series_id: "base",
        series_name: "Base",
        card_local_id: "4",
        set_official_count: 102,
        card_rarity: "Rare",
        card_language: "fr",
        variant: "holo",
        price: 350,
        currency: "EUR",
        snapshot_date: "2026-08-21",
        price_updated_at: "2026-08-21T08:00:00.000Z",
      },
    ],
    error: null,
  });
});

describe("GET /api/cards/top", () => {
  it("returns the current French Top 10 with CDN caching", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=900");
    expect(rpc).toHaveBeenCalledWith("get_current_cardmarket_top", {
      p_language: "fr",
      p_limit: 10,
    });
    await expect(response.json()).resolves.toEqual({
      snapshot_date: "2026-08-21",
      entries: [
        expect.objectContaining({
          rank: 1,
          card_key: "fr-base1-4",
          name: "Dracaufeu",
          variant: "holo",
          price: 350,
          image_url: "https://assets.tcgdex.net/fr/base/base1/4/low.webp",
        }),
      ],
    });
  });

  it("does not invent rankings when no snapshot exists", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      entries: [],
      snapshot_date: null,
    });
  });

  it("returns a controlled error when the ranking RPC fails", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("database down") });

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Le classement Cardmarket est momentanément indisponible.",
    });
  });
});
