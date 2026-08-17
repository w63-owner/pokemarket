import { MARKETPLACE_FIXED_FEE, MARKETPLACE_PERCENT_FEE } from "../constants";

/**
 * Calculate the display price (buyer-facing) from the seller's net price.
 * display_price = round(price_seller + 0.01, 2)
 *
 * Example: seller enters 10.00 -> display = 10.01
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
 * price_seller = max(0.01, round(display_price - 0.01, 2))
 *
 * Example: display 10.01 -> seller gets 10.00
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

/**
 * Parse a user-entered EUR amount with either a comma or a point separator.
 */
export function parseDecimalPrice(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}
