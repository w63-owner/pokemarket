import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Default shipping cost used when no `shipping_matrix` row exists for the
 * (origin, destination, weight class) tuple. Kept low so the buyer still
 * sees a sane number, but ideally the matrix should always have a value.
 */
export const FALLBACK_SHIPPING_COST = 4.99;

/**
 * Resolves the shipping cost in EUR for a given destination + weight class.
 *
 * Used by both:
 *   - the /checkout page (server component) to display the order summary
 *   - the /api/checkout route handler when creating the Stripe session
 *
 * Keeping the same code path on both sides guarantees that what the buyer
 * sees on the checkout summary always equals what Stripe ultimately charges
 * (previously the page was hard-coding 4.99 € while the route looked the
 * cost up in `shipping_matrix`, leaving buyers confused at the Stripe step).
 */
export async function getShippingCost(
  _originCountry: string,
  destCountry: string,
  weightClass: string,
): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("shipping_matrix")
    .select("price")
    .eq("dest_country", destCountry)
    .eq("weight_class", weightClass)
    .limit(1)
    .maybeSingle();

  return data?.price ?? FALLBACK_SHIPPING_COST;
}
