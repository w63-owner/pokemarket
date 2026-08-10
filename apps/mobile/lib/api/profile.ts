import type { Profile, ProfileWithStats } from "@pokemarket/shared";
import {
  getSellerReputation,
  normalizeUrl,
  OWN_PROFILE_UPDATE_RETURNING_COLUMNS,
  PUBLIC_PROFILE_COLUMNS,
  profileUpdateSchema,
} from "@pokemarket/shared";
import { getCurrentUserId, requireUserId } from "@/lib/auth/current-user";
import { supabase } from "@/lib/supabase";

export type ProfileUpdateInput = {
  username?: string;
  bio?: string;
  avatar_url?: string;
  country_code?: string;
  address_line?: string | null;
  city?: string | null;
  postal_code?: string | null;
  instagram_url?: string;
  facebook_url?: string;
  tiktok_url?: string;
};

export async function fetchMyProfile(): Promise<Profile> {
  // Reads must wait for the initial persisted session restoration. Returning
  // `null` while the auth cache is still cold would be cached by React Query
  // as a successful "missing profile" result.
  await requireUserId();

  const { data, error } = await supabase
    .from("profiles_me")
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  if (!data?.id || !data.username) {
    throw new Error("Profil introuvable");
  }
  return data as Profile;
}

/**
 * Loads a public seller profile + aggregate stats. The reputation
 * (avg rating + review count) is now computed server-side via the
 * `get_seller_reputation` RPC instead of pulling every review row, and
 * the listing count uses a HEAD `count: exact` query that scans the
 * partial index `idx_listings_active_seller` without returning rows.
 *
 * Net wire: 3 small queries in parallel instead of 2 + a full reviews
 * payload (~50 rows × ~150 B each = 7.5 KB before parsing).
 */
export async function fetchPublicProfile(
  username: string,
): Promise<ProfileWithStats | null> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq("username", username)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }

  const [{ count: listingCount }, reputation] = await Promise.all([
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", profile.id)
      .eq("status", "ACTIVE"),
    getSellerReputation(supabase, profile.id),
  ]);

  return {
    ...profile,
    address_line: null,
    city: null,
    postal_code: null,
    stripe_account_id: null,
    stripe_customer_id: null,
    kyc_status: null,
    role: "user",
    listing_count: listingCount ?? 0,
    review_count: reputation.reviewCount,
    avg_rating: reputation.reviewCount > 0 ? reputation.avgRating : null,
  } satisfies ProfileWithStats;
}

/**
 * Update the current user's profile. Validates with the shared Zod
 * schema, normalizes social URLs, and writes directly via the
 * Supabase client (RLS allows users to UPDATE only their own row).
 */
export async function updateMyProfile(
  input: ProfileUpdateInput,
): Promise<Profile> {
  const userId = await requireUserId();

  const payload = {
    ...input,
    instagram_url: normalizeUrl(input.instagram_url),
    facebook_url: normalizeUrl(input.facebook_url),
    tiktok_url: normalizeUrl(input.tiktok_url),
  };

  const parsed = profileUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Données invalides";
    throw new Error(first);
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", userId)
    .select(OWN_PROFILE_UPDATE_RETURNING_COLUMNS)
    .single();

  if (updateError) throw new Error(updateError.message);

  const { data, error } = await supabase
    .from("profiles_me")
    .select("*")
    .single();

  if (error || !data?.id || !data.username) {
    throw new Error(error?.message ?? "Profil introuvable");
  }
  return data as Profile;
}

export type ReviewWithReviewer = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: { username: string; avatar_url: string | null } | null;
};

export async function fetchSellerReviews(
  sellerId: string,
): Promise<ReviewWithReviewer[]> {
  const { data: rawReviews, error } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at, reviewer_id")
    .eq("reviewee_id", sellerId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  if (!rawReviews || rawReviews.length === 0) return [];

  const reviewerIds = [...new Set(rawReviews.map((r) => r.reviewer_id))];
  const { data: reviewerProfiles } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", reviewerIds);

  const profileMap = new Map((reviewerProfiles ?? []).map((p) => [p.id, p]));

  return rawReviews.map((r) => {
    const reviewer = profileMap.get(r.reviewer_id);
    return {
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at ?? "",
      reviewer: reviewer
        ? { username: reviewer.username, avatar_url: reviewer.avatar_url }
        : null,
    };
  });
}

export async function isFollowingSeller(sellerId: string): Promise<boolean> {
  const userId = getCurrentUserId();
  if (!userId) return false;

  const { data, error } = await supabase
    .from("favorite_sellers")
    .select("seller_id")
    .eq("user_id", userId)
    .eq("seller_id", sellerId)
    .maybeSingle();

  if (error) return false;
  return !!data;
}

export async function followSeller(sellerId: string): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase
    .from("favorite_sellers")
    .insert({ user_id: userId, seller_id: sellerId });
  if (error) throw new Error(error.message);
}

export async function unfollowSeller(sellerId: string): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase
    .from("favorite_sellers")
    .delete()
    .eq("user_id", userId)
    .eq("seller_id", sellerId);
  if (error) throw new Error(error.message);
}
