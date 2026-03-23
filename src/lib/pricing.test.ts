import { describe, it, expect } from "vitest";
import {
  calcDisplayPrice,
  calcPriceSeller,
  calcFeeAmount,
  calcTotalBuyer,
} from "./pricing";

describe("calcDisplayPrice", () => {
  it("applies 5% fee + 0.70€ fixed fee", () => {
    expect(calcDisplayPrice(10)).toBe(11.2);
  });

  it("returns only fixed fee when seller price is 0", () => {
    expect(calcDisplayPrice(0)).toBe(0.7);
  });

  it("handles high prices correctly", () => {
    expect(calcDisplayPrice(1000)).toBe(1050.7);
  });

  it("rounds to 2 decimal places", () => {
    expect(calcDisplayPrice(9.99)).toBe(11.19);
  });
});

describe("calcPriceSeller", () => {
  it("reverses calcDisplayPrice for standard values", () => {
    expect(calcPriceSeller(11.2)).toBe(10);
  });

  it("floors to 0.01 minimum when display price is very low", () => {
    expect(calcPriceSeller(0)).toBe(0.01);
  });

  it("handles high display prices", () => {
    expect(calcPriceSeller(1050.7)).toBe(1000);
  });
});

describe("calcFeeAmount", () => {
  it("calculates platform fee correctly", () => {
    expect(calcFeeAmount(11.2, 10)).toBe(1.2);
  });

  it("returns 0 when display equals seller price", () => {
    expect(calcFeeAmount(10, 10)).toBe(0);
  });

  it("never returns negative", () => {
    expect(calcFeeAmount(5, 10)).toBe(0);
  });
});

describe("calcTotalBuyer", () => {
  it("sums display price and shipping", () => {
    expect(calcTotalBuyer(11.2, 3.5)).toBe(14.7);
  });

  it("returns display price when shipping is 0", () => {
    expect(calcTotalBuyer(11.2, 0)).toBe(11.2);
  });

  it("handles precision correctly", () => {
    expect(calcTotalBuyer(0.1, 0.2)).toBe(0.3);
  });
});
