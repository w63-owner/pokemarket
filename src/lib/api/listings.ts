import { createClient } from "@/lib/supabase/client";
import type { FeedFilters } from "@/lib/query-keys";
import type { FeedItem, Listing } from "@/types";
import type { Database } from "@/types/database";

type RpcArgs = Database["public"]["Functions"]["search_listings_feed"]["Args"];

const DEFAULT_PAGE_SIZE = 20;

const CARD_NUMBER_RE = /\b([\w]*\d+[\w]*\/[\w]*\d+[\w]*)\b/;

/**
 * Splits a raw search string like "Dracaufeu 11/25" into a text query
 * ("Dracaufeu") and a card number ("11/25").
 */
export function parseSearchQuery(raw: string | undefined): {
  text: string | undefined;
  cardNumber: string | undefined;
} {
  if (!raw) return { text: undefined, cardNumber: undefined };

  const match = raw.match(CARD_NUMBER_RE);
  if (!match) return { text: raw.trim() || undefined, cardNumber: undefined };

  const cardNumber = match[1];
  const text = raw
    .replace(CARD_NUMBER_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    text: text || undefined,
    cardNumber,
  };
}

export type FeedCursor = {
  created_at: string;
  id: string;
  price?: number;
};

export type FeedPage = {
  items: FeedItem[];
  nextCursor: FeedCursor | null;
};

export async function fetchListingsFeed(
  filters: FeedFilters,
  cursor?: FeedCursor,
  limit = DEFAULT_PAGE_SIZE,
  excludeSellerId?: string | null,
): Promise<FeedPage> {
  const supabase = createClient();

  const parsed = parseSearchQuery(filters.q);

  const args: RpcArgs = {
    p_query: parsed.text,
    p_set: filters.set || undefined,
    p_rarity: filters.rarity || undefined,
    p_condition: filters.condition || undefined,
    p_is_graded: filters.is_graded,
    p_grade_min: filters.grade_min,
    p_grade_max: filters.grade_max,
    p_price_min: filters.price_min,
    p_price_max: filters.price_max,
    p_card_number: filters.card_number || parsed.cardNumber,
    p_series: filters.series || undefined,
    p_sort: filters.sort || "date_desc",
    p_limit: limit,
    ...(excludeSellerId ? { p_exclude_seller: excludeSellerId } : {}),
  };

  if (cursor) {
    args.p_cursor_created_at = cursor.created_at;
    args.p_cursor_id = cursor.id;
    if (cursor.price !== undefined) {
      args.p_cursor_price = cursor.price;
    }
  }

  const { data, error } = await supabase.rpc("search_listings_feed", args);

  if (error) {
    throw new Error(error.message);
  }

  const items = (data ?? []) as FeedItem[];
  const hasMore = items.length === limit;

  let nextCursor: FeedCursor | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = {
      created_at: last.created_at,
      id: last.id,
      price: last.display_price,
    };
  }

  return { items, nextCursor };
}

export type CreateListingInput = {
  title: string;
  price_seller: number;
  condition?: string | null;
  is_graded: boolean;
  grading_company?: string | null;
  grade_note?: number | null;
  delivery_weight_class: string;
  cover_image_url: string;
  back_image_url: string;
  card_ref_id?: string | null;
  card_series?: string | null;
  card_block?: string | null;
  card_number?: string | null;
  card_language?: string | null;
  card_rarity?: string | null;
  card_illustrator?: string | null;
};

export async function createListing(
  input: CreateListingInput,
): Promise<Listing> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("listings")
    .insert({
      seller_id: user.id,
      title: input.title,
      price_seller: input.price_seller,
      condition: input.is_graded ? null : (input.condition ?? null),
      is_graded: input.is_graded,
      grading_company: input.is_graded ? (input.grading_company ?? null) : null,
      grade_note: input.is_graded ? (input.grade_note ?? null) : null,
      delivery_weight_class: input.delivery_weight_class,
      cover_image_url: input.cover_image_url,
      back_image_url: input.back_image_url,
      card_ref_id: input.card_ref_id ?? null,
      card_series: input.card_series ?? null,
      card_block: input.card_block ?? null,
      card_number: input.card_number ?? null,
      card_language: input.card_language ?? null,
      card_rarity: input.card_rarity ?? null,
      card_illustrator: input.card_illustrator ?? null,
      status: "ACTIVE",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data as Listing;
}

export async function fetchMyListings(limit = 50): Promise<Listing[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []) as Listing[];
}

export async function deleteListing(listingId: string): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Non authentifié");

  const { error } = await supabase
    .from("listings")
    .delete()
    .eq("id", listingId)
    .eq("seller_id", user.id);

  if (error) throw new Error(error.message);
}

export type UpdateListingInput = {
  id: string;
  title: string;
  price_seller: number;
  condition?: string | null;
  is_graded: boolean;
  grading_company?: string | null;
  grade_note?: number | null;
  cover_image_url: string;
  back_image_url: string;
  card_series?: string | null;
  card_block?: string | null;
  card_number?: string | null;
  card_language?: string | null;
  card_rarity?: string | null;
  card_illustrator?: string | null;
};

export async function updateListing(
  input: UpdateListingInput,
): Promise<Listing> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Non authentifié");

  const { data, error } = await supabase
    .from("listings")
    .update({
      title: input.title,
      price_seller: input.price_seller,
      condition: input.is_graded ? null : (input.condition ?? null),
      is_graded: input.is_graded,
      grading_company: input.is_graded ? (input.grading_company ?? null) : null,
      grade_note: input.is_graded ? (input.grade_note ?? null) : null,
      cover_image_url: input.cover_image_url,
      back_image_url: input.back_image_url,
      card_series: input.card_series ?? null,
      card_block: input.card_block ?? null,
      card_number: input.card_number ?? null,
      card_language: input.card_language ?? null,
      card_rarity: input.card_rarity ?? null,
      card_illustrator: input.card_illustrator ?? null,
    })
    .eq("id", input.id)
    .eq("seller_id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data as Listing;
}
