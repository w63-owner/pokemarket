/** Temporary flat shipping cost, in EUR, used when the matrix has no route. */
export const FALLBACK_SHIPPING_COST = 0.02;

/**
 * Highest supported shipping price, used to conservatively estimate Stripe
 * processing costs before the buyer's destination is known.
 *
 * Keep this value aligned with the maximum price in `shipping_matrix`.
 */
export const MAX_SHIPPING_COST = 19.9;

/**
 * Origin used by checkout display and `/api/checkout` charges.
 * The seeded matrix is France-origin only.
 */
export const SHIPPING_ORIGIN_COUNTRY = "FR";

/**
 * Listing drafts historically stored `standard`; the matrix uses `S`.
 */
export function normalizeShippingWeightClass(weightClass: string): string {
  return weightClass.toLowerCase() === "standard"
    ? "S"
    : weightClass.toUpperCase();
}

export function resolveShippingCost(
  price: number | string | null | undefined,
): number {
  if (price == null || price === "") return FALLBACK_SHIPPING_COST;
  const amount = typeof price === "number" ? price : Number(price);
  return Number.isFinite(amount) ? amount : FALLBACK_SHIPPING_COST;
}

export function shippingCostForDestination(
  shippingByCountry: Record<string, number>,
  destCountry: string,
): number {
  return shippingByCountry[destCountry.toUpperCase()] ?? FALLBACK_SHIPPING_COST;
}
