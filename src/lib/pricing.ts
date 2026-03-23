import { MARKETPLACE_FIXED_FEE, MARKETPLACE_PERCENT_FEE } from "./constants";

/**
 * Calculate the display price (buyer-facing) from the seller's net price.
 * display_price = round(price_seller * 1.05 + 0.70, 2)
 *
 * Example: seller enters 10.00 -> display = 11.20
 */
export function calcDisplayPrice(priceSeller: number): number {
  return (
    Math.round(
      (priceSeller * (1 + MARKETPLACE_PERCENT_FEE) + MARKETPLACE_FIXED_FEE) *
        100,
    ) / 100
  );
}

/**
 * Calculate the seller net price from the display price.
 * price_seller = max(0.01, round((display_price - 0.70) / 1.05, 2))
 *
 * Example: display 11.20 -> seller gets 10.00
 */
export function calcPriceSeller(displayPrice: number): number {
  return Math.max(
    0.01,
    Math.round(
      ((displayPrice - MARKETPLACE_FIXED_FEE) / (1 + MARKETPLACE_PERCENT_FEE)) *
        100,
    ) / 100,
  );
}

/**
 * Calculate the platform fee from display and seller prices.
 * fee = max(0, round(display_price - price_seller, 2))
 */
export function calcFeeAmount(
  displayPrice: number,
  priceSeller: number,
): number {
  return Math.max(0, Math.round((displayPrice - priceSeller) * 100) / 100);
}

/**
 * Calculate total buyer pays = display_price + shipping.
 */
export function calcTotalBuyer(
  displayPrice: number,
  shippingCost: number,
): number {
  return Math.round((displayPrice + shippingCost) * 100) / 100;
}
