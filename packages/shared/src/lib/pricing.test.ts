import { describe, it, expect } from "vitest";
import {
  calcDisplayPrice,
  calcPriceSeller,
  calcFeeAmount,
  calcTotalBuyer,
} from "./pricing";

describe("pricing", () => {
  it("calcDisplayPrice: seller 10 -> display 11.20", () => {
    expect(calcDisplayPrice(10)).toBe(11.2);
  });

  it("calcPriceSeller: display 11.20 -> seller 10", () => {
    expect(calcPriceSeller(11.2)).toBe(10);
  });

  it("calcFeeAmount: display 11.20 - seller 10 = fee 1.20", () => {
    expect(calcFeeAmount(11.2, 10)).toBe(1.2);
  });

  it("calcTotalBuyer: display 11.20 + 4.99 shipping = 16.19", () => {
    expect(calcTotalBuyer(11.2, 4.99)).toBe(16.19);
  });

  it("calcPriceSeller: never below 0.01", () => {
    expect(calcPriceSeller(0)).toBe(0.01);
  });
});
