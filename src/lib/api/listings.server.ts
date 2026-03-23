import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Listing, Profile } from "@/types";

export type ListingDetail = Listing & {
  profiles: Profile;
};

export const fetchListingById = cache(
  async (id: string): Promise<ListingDetail | null> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("listings")
      .select("*, profiles(*)")
      .eq("id", id)
      .single();

    if (error || !data) return null;

    return data as unknown as ListingDetail;
  },
);
