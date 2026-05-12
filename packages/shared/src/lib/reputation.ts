import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

export type SellerReputation = {
  avgRating: number;
  reviewCount: number;
};

/**
 * Fetch a seller's average rating + review count via the
 * `get_seller_reputation` Postgres function. Portable: callers pass
 * their own Supabase client (web server, web browser, or React Native).
 */
export async function getSellerReputation(
  supabase: SupabaseClient<Database>,
  sellerId: string,
): Promise<SellerReputation> {
  const { data, error } = await supabase.rpc("get_seller_reputation", {
    p_seller_id: sellerId,
  });

  if (error || !data || data.length === 0) {
    return { avgRating: 0, reviewCount: 0 };
  }

  const row = data[0];
  return {
    avgRating: Number(row.avg_rating) || 0,
    reviewCount: Number(row.review_count) || 0,
  };
}
