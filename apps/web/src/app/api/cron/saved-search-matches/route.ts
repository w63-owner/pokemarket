import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push/send";
import type { FeedFilters } from "@pokemarket/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Look back one hour so hourly cron never misses a listing.
const LOOKBACK_MINUTES = 65;

// At most this many new listings per cron run to avoid memory issues.
const MAX_NEW_LISTINGS = 500;

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

type NewListing = {
  id: string;
  title: string | null;
  card_series: string | null;
  card_block: string | null;
  card_rarity: string | null;
  card_number: string | null;
  card_language: string | null;
  condition: string | null;
  is_graded: boolean | null;
  grade_note: number | null;
  display_price: number | null;
  seller_id: string;
};

function listingMatchesFilters(
  listing: NewListing,
  params: FeedFilters,
): boolean {
  if (
    params.price_min !== undefined &&
    (listing.display_price ?? 0) < params.price_min
  ) {
    return false;
  }
  if (
    params.price_max !== undefined &&
    (listing.display_price ?? 0) > params.price_max
  ) {
    return false;
  }
  if (params.condition && listing.condition !== params.condition) {
    return false;
  }
  if (
    params.is_graded !== undefined &&
    listing.is_graded !== params.is_graded
  ) {
    return false;
  }
  if (
    params.grade_min !== undefined &&
    (listing.grade_note ?? 0) < params.grade_min
  ) {
    return false;
  }
  if (
    params.grade_max !== undefined &&
    (listing.grade_note ?? 10) > params.grade_max
  ) {
    return false;
  }
  if (params.rarity && listing.card_rarity !== params.rarity) {
    return false;
  }
  if (params.series && listing.card_series !== params.series) {
    return false;
  }
  if (params.set && listing.card_block !== params.set) {
    return false;
  }
  if (params.card_number && listing.card_number !== params.card_number) {
    return false;
  }
  // Keyword search: check title contains all words (case-insensitive)
  if (params.q) {
    const words = params.q.toLowerCase().split(/\s+/).filter(Boolean);
    const haystack = (listing.title ?? "").toLowerCase();
    if (!words.every((w) => haystack.includes(w))) {
      return false;
    }
  }
  return true;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const since = new Date(
      Date.now() - LOOKBACK_MINUTES * 60 * 1000,
    ).toISOString();

    // Fetch new ACTIVE listings (not own-seller listings are not excluded here —
    // we'll let the user's own saved searches skip their own listings if they
    // happen to also be buyers, which is an edge case we accept).
    const { data: newListings, error: listingsError } = await admin
      .from("listings")
      .select(
        "id, title, card_series, card_block, card_rarity, card_number, card_language, condition, is_graded, grade_note, display_price, seller_id",
      )
      .eq("status", "ACTIVE")
      .gte("created_at", since)
      .limit(MAX_NEW_LISTINGS);

    if (listingsError) throw listingsError;

    if (!newListings || newListings.length === 0) {
      return NextResponse.json({ pushed: 0, new_listings: 0 });
    }

    // Fetch all saved searches
    const { data: savedSearches, error: searchesError } = await admin
      .from("saved_searches")
      .select("id, user_id, name, search_params");

    if (searchesError) throw searchesError;
    if (!savedSearches || savedSearches.length === 0) {
      return NextResponse.json({ pushed: 0, new_listings: newListings.length });
    }

    // For each user, collect matching listing titles (deduplicated)
    const matchesByUser = new Map<
      string,
      { searchNames: Set<string>; sampleTitle: string; sampleListingId: string }
    >();

    for (const savedSearch of savedSearches) {
      const params = savedSearch.search_params as FeedFilters;

      const matchingListings = (newListings as NewListing[]).filter(
        (l) =>
          // Never notify users about their own listings
          l.seller_id !== savedSearch.user_id &&
          listingMatchesFilters(l, params),
      );

      if (matchingListings.length === 0) continue;

      const first = matchingListings[0]!;
      const existing = matchesByUser.get(savedSearch.user_id);
      if (existing) {
        existing.searchNames.add(savedSearch.name);
      } else {
        matchesByUser.set(savedSearch.user_id, {
          searchNames: new Set([savedSearch.name]),
          sampleTitle: first.title ?? "Carte Pokémon",
          sampleListingId: first.id,
        });
      }
    }

    if (matchesByUser.size === 0) {
      return NextResponse.json({ pushed: 0, new_listings: newListings.length });
    }

    let pushed = 0;
    const errors: string[] = [];

    await Promise.allSettled(
      Array.from(matchesByUser.entries()).map(async ([userId, match]) => {
        const searchCount = match.searchNames.size;
        const title =
          searchCount === 1
            ? `Nouvelle annonce : "${[...match.searchNames][0]}"`
            : `${searchCount} recherches ont de nouveaux résultats`;
        const body =
          searchCount === 1
            ? `${match.sampleTitle} correspond à votre alerte.`
            : `De nouvelles cartes correspondent à vos recherches sauvegardées.`;

        try {
          await sendPushNotification(userId, title, body, "/", {
            category: "saved_searches",
          });
          pushed++;
        } catch (err) {
          Sentry.captureException(err);
          errors.push(
            `user=${userId}: ${err instanceof Error ? err.message : "unknown"}`,
          );
        }
      }),
    );

    return NextResponse.json({
      pushed,
      users_notified: matchesByUser.size,
      new_listings: newListings.length,
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("[cron/saved-search-matches] Failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
