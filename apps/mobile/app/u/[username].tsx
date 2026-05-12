import { ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/hooks/use-auth";
import { usePublicProfile, useSellerReviews } from "@/hooks/use-profile";
import { useSellerListings } from "@/hooks/use-listings";
import { Skeleton, SmartBackButton, Text } from "@/components/ui";
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
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center justify-between border-b border-border bg-card px-2 py-3">
        <View className="flex-row items-center gap-3">
          <SmartBackButton />
          <Text className="text-base font-semibold">@{username}</Text>
        </View>
        {profile ? (
          <View className="mr-2">
            <ShareProfileButton username={profile.username} />
          </View>
        ) : null}
      </View>

      {isLoading || !profile ? (
        <View className="gap-3 p-4">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96 }}>
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
    </SafeAreaView>
  );
}
