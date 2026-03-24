import { createClient } from "@/lib/supabase/client";
import type { FeedItem } from "@/types";

export async function getFavoriteListingIds(): Promise<string[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("favorite_listings")
    .select("listing_id")
    .eq("user_id", user.id);

  if (error) throw error;

  return (data ?? []).map((row) => row.listing_id);
}

export async function getFavoriteListings(): Promise<FeedItem[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("favorite_listings")
    .select(
      `
      listing_id,
      created_at,
      listings!inner (
        id, seller_id, title, display_price, condition,
        is_graded, grade_note, cover_image_url, card_series,
        card_rarity, card_language, card_number,
        created_at, status,
        profiles!listings_seller_id_fkey!inner ( username, avatar_url )
      )
    `,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const l = row.listings as unknown as {
        id: string;
        seller_id: string;
        title: string;
        display_price: number;
        condition: string;
        is_graded: boolean;
        grade_note: number | null;
        cover_image_url: string | null;
        card_series: string | null;
        card_rarity: string | null;
        card_language: string | null;
        card_number: string | null;
        created_at: string;
        status: string;
        profiles: { username: string; avatar_url: string | null };
      };
      return {
        id: l.id,
        seller_id: l.seller_id,
        title: l.title,
        display_price: l.display_price,
        condition: l.condition,
        is_graded: l.is_graded,
        grade_note: l.grade_note ?? 0,
        cover_image_url: l.cover_image_url ?? "",
        card_series: l.card_series ?? "",
        card_rarity: l.card_rarity,
        card_language: l.card_language,
        card_number: l.card_number,
        created_at: l.created_at,
        seller_username: l.profiles.username,
        seller_avatar_url: l.profiles.avatar_url ?? "",
      } satisfies FeedItem;
    })
    .filter((item) => item !== null);
}

export async function toggleFavoriteListing(
  listingId: string,
  isFavorite: boolean,
): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (isFavorite) {
    const { error } = await supabase
      .from("favorite_listings")
      .delete()
      .eq("user_id", user.id)
      .eq("listing_id", listingId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("favorite_listings")
      .insert({ user_id: user.id, listing_id: listingId });
    if (error) throw error;
  }
}
