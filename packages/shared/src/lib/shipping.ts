/**
 * Default shipping cost used when no `shipping_matrix` row exists for the
 * (origin, destination, weight class) tuple. Kept low so the buyer still
 * sees a sane number, but ideally the matrix should always have a value.
 *
 * The actual lookup against the matrix lives server-side in apps/web/src/lib/shipping.ts
 * (it requires the admin Supabase client).
 */
export const FALLBACK_SHIPPING_COST = 4.99;
