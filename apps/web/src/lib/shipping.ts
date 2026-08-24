import { FALLBACK_SHIPPING_COST } from "@deckdealr/shared";

/**
 * Temporary flat shipping cost used for every route.
 */
export { FALLBACK_SHIPPING_COST };

/**
 * Resolves the shipping cost in EUR for a given destination + weight class.
 *
 * Used by both:
 *   - the /checkout page (server component) to display the order summary
 *   - the /api/checkout route handler when creating the Stripe session
 *
 * Keeping the same code path on both sides guarantees that what the buyer
 * sees on the checkout summary always equals what Stripe ultimately charges.
 */
export async function getShippingCost(
  _originCountry: string,
  _destCountry: string,
  _weightClass: string,
): Promise<number> {
  return FALLBACK_SHIPPING_COST;
}
