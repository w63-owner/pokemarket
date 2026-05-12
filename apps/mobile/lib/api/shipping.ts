import { FALLBACK_SHIPPING_COST } from "@pokemarket/shared";
import { supabase } from "@/lib/supabase";

/**
 * Looks up the shipping cost from `shipping_matrix` directly via Supabase.
 * The table has a public-read RLS policy, so the mobile anon client can
 * query it without going through the Next.js API.
 *
 * Mirrors `apps/web/src/lib/shipping.ts:getShippingCost` so the buyer
 * sees the same total on mobile and web.
 */
export async function fetchShippingCost(
  destCountry: string,
  weightClass: string,
): Promise<number> {
  const { data } = await supabase
    .from("shipping_matrix")
    .select("price")
    .eq("origin_country", "FR")
    .eq("dest_country", destCountry)
    .eq("weight_class", weightClass)
    .maybeSingle();

  return data?.price ?? FALLBACK_SHIPPING_COST;
}
