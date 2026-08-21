import { describe, expect, it } from "vitest";

import {
  buildTcgdexCardImageUrl,
  parseTcgdexCardmarketPricing,
} from "./cardmarket";

describe("parseTcgdexCardmarketPricing", () => {
  it("extracts current normal and holo Cardmarket fields", () => {
    const result = parseTcgdexCardmarketPricing({
      cardmarket: {
        updated: "2026-08-20T00:42:15.000Z",
        unit: "EUR",
        avg: 12.4,
        trend: 13.2,
        avg30: 11.9,
        "avg-holo": 22.1,
        "trend-holo": 23.5,
        "avg30-holo": 20.8,
      },
    });

    expect(result).toEqual({
      source: "cardmarket",
      currency: "EUR",
      updatedAt: "2026-08-20T00:42:15.000Z",
      normal: {
        variant: "normal",
        current: 13.2,
        trend: 13.2,
        average: 12.4,
        average30: 11.9,
      },
      holo: {
        variant: "holo",
        current: 23.5,
        trend: 23.5,
        average: 22.1,
        average30: 20.8,
      },
    });
  });

  it("falls back from trend to average and ignores zero prices", () => {
    const result = parseTcgdexCardmarketPricing({
      cardmarket: {
        unit: "eur",
        trend: 0,
        avg: 4.25,
        avg30: 3.8,
        "trend-holo": 0,
        "avg-holo": null,
        "avg30-holo": 0,
      },
    });

    expect(result?.normal.current).toBe(4.25);
    expect(result?.normal.trend).toBeNull();
    expect(result?.holo.current).toBeNull();
    expect(result?.currency).toBe("EUR");
  });

  it("returns null for missing or malformed Cardmarket data", () => {
    expect(parseTcgdexCardmarketPricing(null)).toBeNull();
    expect(parseTcgdexCardmarketPricing({ cardmarket: "invalid" })).toBeNull();
  });

  it("accepts Unix timestamps expressed in seconds", () => {
    const result = parseTcgdexCardmarketPricing({
      cardmarket: { updated: 1_753_747_200, trend: 1 },
    });

    expect(result?.updatedAt).toBe("2025-07-29T00:00:00.000Z");
  });
});

describe("buildTcgdexCardImageUrl", () => {
  it("builds a quality-specific asset URL", () => {
    expect(buildTcgdexCardImageUrl("fr", "sv", "sv03", "125", "high")).toBe(
      "https://assets.tcgdex.net/fr/sv/sv03/125/high.webp",
    );
  });

  it("returns null when card coordinates are incomplete", () => {
    expect(buildTcgdexCardImageUrl("fr", null, "sv03", "125")).toBeNull();
  });
});
