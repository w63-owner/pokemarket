import { describe, expect, it } from "vitest";
import {
  FALLBACK_SHIPPING_COST,
  normalizeShippingWeightClass,
  resolveShippingCost,
  shippingCostForDestination,
} from "./shipping";

describe("normalizeShippingWeightClass", () => {
  it("maps the legacy standard label to S", () => {
    expect(normalizeShippingWeightClass("standard")).toBe("S");
    expect(normalizeShippingWeightClass("Standard")).toBe("S");
  });

  it("uppercases matrix weight classes", () => {
    expect(normalizeShippingWeightClass("s")).toBe("S");
    expect(normalizeShippingWeightClass("xl")).toBe("XL");
  });
});

describe("resolveShippingCost", () => {
  it("returns the matrix price when present", () => {
    expect(resolveShippingCost(4.9)).toBe(4.9);
    expect(resolveShippingCost("7.90")).toBe(7.9);
  });

  it("falls back when the route is missing or invalid", () => {
    expect(resolveShippingCost(null)).toBe(FALLBACK_SHIPPING_COST);
    expect(resolveShippingCost(undefined)).toBe(FALLBACK_SHIPPING_COST);
    expect(resolveShippingCost("")).toBe(FALLBACK_SHIPPING_COST);
    expect(resolveShippingCost("nope")).toBe(FALLBACK_SHIPPING_COST);
  });
});

describe("shippingCostForDestination", () => {
  it("uses the quoted destination instead of a hardcoded FR rate", () => {
    const shippingByCountry = { FR: 2.5, BE: 4.9, CH: 7.9 };

    expect(shippingCostForDestination(shippingByCountry, "FR")).toBe(2.5);
    expect(shippingCostForDestination(shippingByCountry, "be")).toBe(4.9);
    expect(shippingCostForDestination(shippingByCountry, "CH")).toBe(7.9);
  });

  it("falls back when the destination is not in the quote map", () => {
    expect(shippingCostForDestination({ FR: 2.5 }, "IT")).toBe(
      FALLBACK_SHIPPING_COST,
    );
  });
});
