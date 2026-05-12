import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type SellerReputation = {
  avgRating: number;
  reviewCount: number;
};

export const getSellerReputation = cache(
  async (sellerId: string): Promise<SellerReputation> => {
    const supabase = await createClient();

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
  },
);
