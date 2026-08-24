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

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({
    data: [
      {
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
      },
    ],
    error: null,
  });
});

describe("GET /api/cards/search", () => {
  it("validates short queries", async () => {
    const response = await GET(
      new NextRequest("https://thedeckdealr.test/api/cards/search?q=D"),
    );

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns rich French suggestions with CDN caching", async () => {
    const response = await GET(
      new NextRequest(
        "https://thedeckdealr.test/api/cards/search?q=Dracaufeu%204%2F102",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(rpc).toHaveBeenCalledWith("match_tcgdex_cards", {
      p_name: "Dracaufeu",
      p_language: "fr",
      p_local_id: "4",
    });
    await expect(response.json()).resolves.toEqual({
      results: [
        expect.objectContaining({
          card_key: "fr-base1-4",
          name: "Dracaufeu",
          set_name: "Set de Base",
          local_id: "4",
          image_url: "https://assets.tcgdex.net/fr/base/base1/4/low.webp",
        }),
      ],
    });
  });

  it("returns a controlled error when the catalog fails", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("database down") });

    const response = await GET(
      new NextRequest("https://thedeckdealr.test/api/cards/search?q=Dracaufeu"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "La recherche de cartes est momentanément indisponible.",
    });
  });
});
