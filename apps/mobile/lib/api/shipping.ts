import { FALLBACK_SHIPPING_COST } from "@pokemarket/shared";

/**
 * Returns the temporary flat shipping cost used on mobile and web.
 */
export async function fetchShippingCost(
  _destCountry: string,
  _weightClass: string,
): Promise<number> {
  return FALLBACK_SHIPPING_COST;
}
