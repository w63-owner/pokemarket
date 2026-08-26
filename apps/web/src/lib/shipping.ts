import {
  FALLBACK_SHIPPING_COST,
  SHIPPING_ORIGIN_COUNTRY,
  normalizeShippingWeightClass,
  resolveShippingCost,
  shippingCostForDestination,
} from "@deckdealr/shared";
import { createClient } from "@/lib/supabase/server";

/**
 * Fallback used only when the configured route is unavailable.
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
  originCountry: string,
  destCountry: string,
  weightClass: string,
): Promise<number> {
  const costs = await getShippingCostsByDestination(originCountry, weightClass);
  return shippingCostForDestination(costs, destCountry);
}

/**
 * Loads every destination price for one origin + weight class so the checkout
 * UI can follow country changes without drifting from `/api/checkout`.
 */
export async function getShippingCostsByDestination(
  originCountry: string = SHIPPING_ORIGIN_COUNTRY,
  weightClass: string,
): Promise<Record<string, number>> {
  const normalizedWeightClass = normalizeShippingWeightClass(weightClass);
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("shipping_matrix")
      .select("dest_country, price")
      .eq("origin_country", originCountry.toUpperCase())
      .eq("weight_class", normalizedWeightClass);

    if (error || !data) return {};

    const costs: Record<string, number> = {};
    for (const row of data) {
      if (!row.dest_country || row.price == null) continue;
      costs[row.dest_country.toUpperCase()] = resolveShippingCost(row.price);
    }
    return costs;
  } catch {
    return {};
  }
}
