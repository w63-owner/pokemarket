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
 * Toggle a favorite atomically server-side. Calls the
 * `toggle_favorite_listing` Postgres function which performs the
 * SELECT + INSERT/DELETE in a single round-trip and returns the new
 * favorited state. Replaces the previous 3-RTT pattern (auth.getUser
 * → SELECT existing → DELETE-or-INSERT).
 */
export async function toggleFavoriteListing(
  listingId: string,
): Promise<boolean> {
  await requireUserId();

  const { data, error } = await supabase.rpc("toggle_favorite_listing", {
    p_listing_id: listingId,
  });

  if (error) throw new Error(error.message);
  return data === true;
}
