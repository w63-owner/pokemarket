/** Temporary flat shipping cost, in EUR, used on every platform. */
export const FALLBACK_SHIPPING_COST = 0.02;

/**
 * Highest supported shipping price, used to conservatively estimate Stripe
 * processing costs before the buyer's destination is known.
 *
 * Keep this value aligned with the maximum price in `shipping_matrix`.
 */
export const MAX_SHIPPING_COST = 19.9;
