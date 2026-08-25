import { FALLBACK_SHIPPING_COST } from "@deckdealr/shared";
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
  const normalizedWeightClass =
    weightClass.toLowerCase() === "standard" ? "S" : weightClass.toUpperCase();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("shipping_matrix")
      .select("price")
      .eq("origin_country", originCountry.toUpperCase())
      .eq("dest_country", destCountry.toUpperCase())
      .eq("weight_class", normalizedWeightClass)
      .maybeSingle();

    if (error || data?.price == null) return FALLBACK_SHIPPING_COST;
    return Number(data.price);
  } catch {
    return FALLBACK_SHIPPING_COST;
  }
}
