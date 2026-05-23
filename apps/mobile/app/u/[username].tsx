import { ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";

import { useAuth } from "@/hooks/use-auth";
import { usePublicProfile, useSellerReviews } from "@/hooks/use-profile";
import { useSellerListings } from "@/hooks/use-listings";
import { Skeleton } from "@/components/ui";
import { MobileHeader } from "@/components/layout/mobile-header";
import { SellerReputationBadge } from "@/components/shared";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { ShareProfileButton } from "@/components/profile/share-profile-button";
import { FloatingFollowBar } from "@/components/profile/follow-button";

export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { user } = useAuth();
  const { data: profile, isLoading } = usePublicProfile(username);
  const { data: listings = [] } = useSellerListings(profile?.id ?? "");
  const { data: reviews = [] } = useSellerReviews(profile?.id ?? "");

  const isOwnProfile = !!user && user.id === profile?.id;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <MobileHeader
        title={`@${username}`}
        rightAction={
          profile ? <ShareProfileButton username={profile.username} /> : null
        }
      />

      {isLoading || !profile ? (
        <View className="gap-3 p-4">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          >
            <View className="gap-4">
              <SellerReputationBadge
                avgRating={profile.avg_rating ?? 0}
                reviewCount={profile.review_count}
              />

              <ProfileTabs
                profile={profile}
                listings={listings}
                reviews={reviews}
              />
            </View>
          </ScrollView>

          {!isOwnProfile && user ? (
            <FloatingFollowBar sellerId={profile.id} />
          ) : null}
        </>
      )}
    </View>
  );
}
