import { cache } from "react";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Listing, Profile } from "@/types";

export type CardMetadata = {
  illustrator: string | null;
  rarity: string | null;
  set_name: string | null;
  series_name: string | null;
  category: string | null;
};

export type ListingDetail = Listing & {
  profiles: Profile;
  card_metadata: CardMetadata | null;
};

export const fetchListingById = cache(
  async (id: string): Promise<ListingDetail | null> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("listings")
      .select("*, profiles!listings_seller_id_fkey(*)")
      .eq("id", id)
      .single();

    if (error || !data) return null;

    let card_metadata: CardMetadata | null = null;

    if (data.card_ref_id) {
      const { data: card } = await supabase
        .from("tcgdex_cards")
        .select("illustrator, rarity, set_id, category")
        .eq("card_key", data.card_ref_id)
        .limit(1)
        .single();

      if (card) {
        let set_name: string | null = null;
        let series_name: string | null = null;

        if (card.set_id) {
          const { data: set } = await supabase
            .from("tcgdex_sets")
            .select("name, series_id")
            .eq("id", card.set_id)
            .limit(1)
            .single();

          if (set) {
            set_name = set.name;
            if (set.series_id) {
              const { data: series } = await supabase
                .from("tcgdex_series")
                .select("name")
                .eq("id", set.series_id)
                .limit(1)
                .single();
              series_name = series?.name ?? null;
            }
          }
        }

        card_metadata = {
          illustrator: card.illustrator,
          rarity: card.rarity,
          set_name,
          series_name,
          category: card.category,
        };
      }
    }

    return {
      ...(data as unknown as Omit<ListingDetail, "card_metadata">),
      card_metadata,
    };
  },
);

export function revalidateListing(listingId: string) {
  revalidatePath(`/listing/${listingId}`);
}

export function revalidateSellerProfile(username: string) {
  revalidatePath(`/u/${username}`);
}
