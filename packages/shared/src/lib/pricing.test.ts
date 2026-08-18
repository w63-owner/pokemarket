import { describe, it, expect } from "vitest";
import {
  calcBuyerProtectionFee,
  calcDisplayPrice,
  calcPriceSeller,
  calcFeeAmount,
  calcTotalBuyer,
  parseDecimalPrice,
} from "./pricing";
import {
  MARKETPLACE_PERCENT_FEE,
  STRIPE_STANDARD_EEA_FIXED_FEE,
  STRIPE_STANDARD_EEA_PERCENT_FEE,
} from "../constants";
import { MAX_SHIPPING_COST } from "./shipping";

describe("pricing", () => {
  it("calcBuyerProtectionFee: includes commission and grossed-up Stripe estimate", () => {
    const sellerPrice = 10;
    const protection = calcBuyerProtectionFee(sellerPrice);
    const displayPrice = sellerPrice + protection;
    const marketplaceCommission = sellerPrice * MARKETPLACE_PERCENT_FEE;
    const simulatedStripeFee =
      STRIPE_STANDARD_EEA_FIXED_FEE +
      (displayPrice + MAX_SHIPPING_COST) * STRIPE_STANDARD_EEA_PERCENT_FEE;

    expect(protection).toBe(1.22);
    expect(protection - marketplaceCommission).toBeGreaterThanOrEqual(
      simulatedStripeFee,
    );
  });

  it("calcDisplayPrice: seller 10 -> display 11.22", () => {
    expect(calcDisplayPrice(10)).toBe(11.22);
  });

  it("calcPriceSeller: reverses a generated display price", () => {
    expect(calcPriceSeller(11.22)).toBe(10);
  });

  it("calcFeeAmount: display 11.22 - seller 10 = fee 1.22", () => {
    expect(calcFeeAmount(11.22, 10)).toBe(1.22);
  });

  it("calcTotalBuyer: display 11.22 + 0.02 shipping = 11.24", () => {
    expect(calcTotalBuyer(11.22, 0.02)).toBe(11.24);
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
