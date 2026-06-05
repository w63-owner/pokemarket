import type { FeedItem } from "@pokemarket/shared";
import { getCurrentUserId, requireUserId } from "@/lib/auth/current-user";
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
  const userId = getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("favorite_listings")
    .select("listing_id")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.listing_id);
}

export async function fetchFavoriteListings(): Promise<FeedItem[]> {
  const userId = getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("favorite_listings")
    .select(
      "listing:listings!favorite_listings_listing_id_fkey(*, seller:profiles!listings_seller_id_fkey(id, username, avatar_url))",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r: unknown) => (r as { listing: FeedItem }).listing)
    .filter(Boolean) as FeedItem[];
}

export async function fetchFavoriteSellers(): Promise<FavoriteSellerRow[]> {
  const userId = getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("favorite_sellers")
    .select(
      `
      seller_id,
      created_at,
      profiles!favorite_sellers_seller_id_fkey ( username, avatar_url, country_code )
    `,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    seller_id: row.seller_id,
    created_at: row.created_at,
    profiles: row.profiles as unknown as FavoriteSellerRow["profiles"],
  }));
}

/**
 * Toggle a favorite. Uses explicit DELETE/INSERT instead of the RPC
 * toggle because auth.uid() in the RPC can desync from the JS session.
 *
 * @param listingId - The listing to toggle
 * @param isFavorite - Current state: true = remove, false = add
 * @returns New favorite state after toggle
 */
export async function toggleFavoriteListing(
  listingId: string,
  isFavorite: boolean,
): Promise<boolean> {
  const userId = await requireUserId();

  if (isFavorite) {
    const { error } = await supabase
      .from("favorite_listings")
      .delete()
      .eq("user_id", userId)
      .eq("listing_id", listingId);
    if (error) throw new Error(error.message);
    return false;
  } else {
    const { error } = await supabase
      .from("favorite_listings")
      .insert({ user_id: userId, listing_id: listingId });
    if (error) throw new Error(error.message);
    return true;
  }
}
