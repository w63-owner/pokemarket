import { describe, it, expect } from "vitest";
import {
  calcDisplayPrice,
  calcPriceSeller,
  calcFeeAmount,
  calcTotalBuyer,
  parseDecimalPrice,
} from "./pricing";

describe("pricing", () => {
  it("calcDisplayPrice: seller 10 -> display 10.01", () => {
    expect(calcDisplayPrice(10)).toBe(10.01);
  });

  it("calcPriceSeller: display 10.01 -> seller 10", () => {
    expect(calcPriceSeller(10.01)).toBe(10);
  });

  it("calcFeeAmount: display 10.01 - seller 10 = fee 0.01", () => {
    expect(calcFeeAmount(10.01, 10)).toBe(0.01);
  });

  it("calcTotalBuyer: display 10.01 + 0.02 shipping = 10.03", () => {
    expect(calcTotalBuyer(10.01, 0.02)).toBe(10.03);
  });

  it("calcPriceSeller: never below 0.01", () => {
    expect(calcPriceSeller(0)).toBe(0.01);
  });

  it.each([
    ["1,1", 1.1],
    ["1.1", 1.1],
    ["0,25", 0.25],
  ])("parseDecimalPrice: parses %s", (value, expected) => {
    expect(parseDecimalPrice(value)).toBe(expected);
  });
});
