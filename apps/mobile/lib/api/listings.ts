import type {
  Database,
  FeedFilters,
  FeedItem,
  Listing,
  ListingWithSeller,
} from "@pokemarket/shared";
import {
  getSellerReputation,
  listingCreateSchema,
  type SellerReputation,
} from "@pokemarket/shared";
import { getCurrentUserId, requireUserId } from "@/lib/auth/current-user";
import {
  uploadImageFromUri,
  contentTypeToExt,
} from "@/lib/storage/upload-image";
import { supabase } from "@/lib/supabase";

type RpcArgs = Database["public"]["Functions"]["search_listings_feed"]["Args"];

const DEFAULT_PAGE_SIZE = 20;
const CARD_NUMBER_RE = /\b([\w]*\d+[\w]*\/[\w]*\d+[\w]*)\b/;

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
  return { text: text || undefined, cardNumber };
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
    if (cursor.price !== undefined) args.p_cursor_price = cursor.price;
  }

  const { data, error } = await supabase.rpc("search_listings_feed", args);
  if (error) throw new Error(error.message);

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

export async function fetchListing(id: string): Promise<ListingWithSeller> {
  const { data, error } = await supabase
    .from("listings")
    .select("*, seller:profiles!listings_seller_id_fkey(username, avatar_url)")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as ListingWithSeller;
}

/**
 * Pull the rating + review count for a seller through the shared
 * `get_seller_reputation` RPC. Wraps the helper from
 * `@pokemarket/shared/lib/reputation` to keep call-sites in the
 * mobile feature folders free of any direct RPC import.
 */
export async function fetchSellerReputation(
  sellerId: string,
): Promise<SellerReputation> {
  return getSellerReputation(supabase, sellerId);
}

export async function fetchMyListings(): Promise<Listing[]> {
  const userId = getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("seller_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchSellerListings(
  sellerId: string,
): Promise<Listing[]> {
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("seller_id", sellerId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ────────────────────────────────────────────────────────────────────────────
// Mutations (sell flow)
// ────────────────────────────────────────────────────────────────────────────

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
  const parsed = listingCreateSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Données invalides";
    throw new Error(first);
  }

  const userId = await requireUserId();

  const d = parsed.data;

  const { data, error } = await supabase
    .from("listings")
    .insert({
      seller_id: userId,
      title: d.title,
      price_seller: d.price_seller,
      condition: d.is_graded ? null : (d.condition ?? null),
      is_graded: d.is_graded,
      grading_company: d.is_graded ? (d.grading_company ?? null) : null,
      grade_note: d.is_graded ? (d.grade_note ?? null) : null,
      delivery_weight_class: d.delivery_weight_class,
      cover_image_url: d.cover_image_url,
      back_image_url: d.back_image_url,
      card_ref_id: d.card_ref_id ?? null,
      card_series: d.card_series ?? null,
      card_block: d.card_block ?? null,
      card_number: d.card_number ?? null,
      card_language: d.card_language ?? null,
      card_rarity: d.card_rarity ?? null,
      card_illustrator: d.card_illustrator ?? null,
      status: "ACTIVE",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Listing;
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
  const userId = await requireUserId();

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
    .eq("seller_id", userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Listing;
}

export async function deleteListing(listingId: string): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase
    .from("listings")
    .delete()
    .eq("id", listingId)
    .eq("seller_id", userId);

  if (error) throw new Error(error.message);
}

export async function fetchOwnedListing(id: string): Promise<Listing> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("id", id)
    .eq("seller_id", userId)
    .single();

  if (error) throw new Error(error.message);
  return data as Listing;
}

// ────────────────────────────────────────────────────────────────────────────
// Image upload (Supabase Storage)
// ────────────────────────────────────────────────────────────────────────────

const STORAGE_BUCKET = "listing-images";

export type UploadedListingImage = {
  publicUrl: string;
  storagePath: string;
};

/**
 * Upload an image from a local `file://` URI to Supabase Storage.
 * Uses native multipart upload via `expo-file-system` to avoid the
 * base64 → ArrayBuffer memory spike on large images.
 */
export async function uploadListingImage(params: {
  uri: string;
  contentType: "image/jpeg" | "image/webp" | "image/png";
  previousPath?: string | null;
}): Promise<UploadedListingImage> {
  const userId = await requireUserId();

  if (params.previousPath) {
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([params.previousPath])
      .catch(() => {
        // Non-fatal: orphan file will be reaped by storage lifecycle rules.
      });
  }

  const ext = contentTypeToExt(params.contentType);
  const fileName = `${userId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  await uploadImageFromUri({
    uri: params.uri,
    contentType: params.contentType,
    bucket: STORAGE_BUCKET,
    storagePath: fileName,
  });

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);

  return { publicUrl, storagePath: fileName };
}

export async function removeListingImage(storagePath: string): Promise<void> {
  await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([storagePath])
    .catch(() => {
      // Best-effort: storage lifecycle handles orphans.
    });
}
