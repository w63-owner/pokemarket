import {
  FALLBACK_SHIPPING_COST,
  SHIPPING_ORIGIN_COUNTRY,
  normalizeShippingWeightClass,
  resolveShippingCost,
} from "@deckdealr/shared";
import { supabase } from "@/lib/supabase";

/**
 * Resolves the shipping cost the buyer will actually be charged.
 * Must stay aligned with `apps/web/src/lib/shipping.ts` and `/api/checkout`.
 */
export async function fetchShippingCost(
  destCountry: string,
  weightClass: string,
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("shipping_matrix")
      .select("price")
      .eq("origin_country", SHIPPING_ORIGIN_COUNTRY)
      .eq("dest_country", destCountry.toUpperCase())
      .eq("weight_class", normalizeShippingWeightClass(weightClass))
      .maybeSingle();

    if (error || data?.price == null) return FALLBACK_SHIPPING_COST;
    return resolveShippingCost(data.price);
  } catch {
    return FALLBACK_SHIPPING_COST;
  }
}
