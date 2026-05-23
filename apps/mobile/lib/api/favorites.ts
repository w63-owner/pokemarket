import type { FeedItem } from "@pokemarket/shared";
import { supabase } from "@/lib/supabase";

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
