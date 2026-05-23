import type { FeedItem } from "@pokemarket/shared";
import { supabase } from "@/lib/supabase";

export type FavoriteSellerRow = {
  seller_id: string;
  created_at: string | null;
  profiles: {
    username: string;
    avatar_url: string | null;
    country_code: string | null;
  };
};

export async function fetchFavoriteListingIds(): Promise<string[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("favorite_listings")
    .select("listing_id")
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.listing_id);
}

export async function fetchFavoriteListings(): Promise<FeedItem[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("favorite_listings")
    .select(
      "listing:listings!favorite_listings_listing_id_fkey(*, seller:profiles!listings_seller_id_fkey(id, username, avatar_url))",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r: unknown) => (r as { listing: FeedItem }).listing)
    .filter(Boolean) as FeedItem[];
}

export async function fetchFavoriteSellers(): Promise<FavoriteSellerRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("favorite_sellers")
    .select(
      `
      seller_id,
      created_at,
      profiles!favorite_sellers_seller_id_fkey ( username, avatar_url, country_code )
    `,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    seller_id: row.seller_id,
    created_at: row.created_at,
    profiles: row.profiles as unknown as FavoriteSellerRow["profiles"],
  }));
}

export async function toggleFavoriteListing(
  listingId: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data: existing } = await supabase
    .from("favorite_listings")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("favorite_listings")
      .delete()
      .eq("user_id", user.id)
      .eq("listing_id", listingId);
    return false;
  }

  await supabase
    .from("favorite_listings")
    .insert({ user_id: user.id, listing_id: listingId });
  return true;
}
