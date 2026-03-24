import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MobileHeader } from "@/components/layout/mobile-header";
import { ShareProfileButton } from "@/components/profile/share-profile-button";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { FollowButton } from "@/components/profile/follow-button";
import type { Metadata } from "next";
import type { Profile } from "@/types";

type Props = { params: Promise<{ username: string }> };

type ReviewWithReviewer = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: { username: string; avatar_url: string | null } | null;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_url, bio")
    .eq("username", username)
    .single();

  return {
    title: `${username} — Vendeur`,
    description:
      profile?.bio ?? `Découvrez le profil de ${username} sur PokeMarket`,
    openGraph: {
      title: `${username} — Vendeur sur PokeMarket`,
      ...(profile?.avatar_url && {
        images: [{ url: profile.avatar_url, width: 200, height: 200 }],
      }),
    },
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  if (!profile) notFound();

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const isOwnProfile = currentUser?.id === profile.id;

  const [listingsResult, reviewsResult, followResult] = await Promise.all([
    supabase
      .from("listings")
      .select("id, title, display_price, cover_image_url, condition")
      .eq("seller_id", profile.id)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("reviews")
      .select("id, rating, comment, created_at, reviewer_id")
      .eq("reviewee_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(50),

    currentUser && !isOwnProfile
      ? supabase
          .from("favorite_sellers")
          .select("seller_id")
          .eq("user_id", currentUser.id)
          .eq("seller_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const listings = listingsResult.data ?? [];

  const rawReviews = reviewsResult.data ?? [];
  let reviews: ReviewWithReviewer[] = [];

  if (rawReviews.length > 0) {
    const reviewerIds = [...new Set(rawReviews.map((r) => r.reviewer_id))];
    const { data: reviewerProfiles } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", reviewerIds);

    const profileMap = new Map((reviewerProfiles ?? []).map((p) => [p.id, p]));

    reviews = rawReviews.map((r) => {
      const reviewer = profileMap.get(r.reviewer_id);
      return {
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
        reviewer: reviewer
          ? { username: reviewer.username, avatar_url: reviewer.avatar_url }
          : null,
      };
    });
  }

  const isFollowing = !!followResult.data;

  return (
    <>
      <MobileHeader
        title={profile.username}
        rightAction={<ShareProfileButton username={profile.username} />}
      />

      <div className="mx-auto max-w-2xl px-4 pt-4 pb-28">
        <ProfileTabs
          profile={profile as Profile}
          listings={listings}
          reviews={reviews}
        />
      </div>

      {currentUser && !isOwnProfile && (
        <FollowButton sellerId={profile.id} initialIsFollowing={isFollowing} />
      )}
    </>
  );
}
