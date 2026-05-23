import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar, Info, MapPin, PackageOpen, Star } from "lucide-react-native";
import { FacebookIcon, InstagramIcon, TikTokIcon } from "./social-icons";
import {
  countryCodeToFlag,
  formatRelativeDate,
  regionDisplayName,
  type FeedItem,
  type Listing,
  type Profile,
} from "@pokemarket/shared";

import {
  Avatar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from "@/components/ui";
import { EmptyState, StarRating } from "@/components/shared";
import { ListingCard } from "@/components/feed/listing-card";
import { useThemeColor } from "@/lib/theme-colors";

import type { ReviewWithReviewer } from "@/lib/api/profile";

type Props = {
  profile: Profile;
  listings: Listing[];
  reviews: ReviewWithReviewer[];
};

// Bottom padding so panel content can scroll past the FloatingFollowBar
// without being clipped on profiles where it is rendered.
const PANEL_CONTENT_STYLE = {
  padding: 16,
  paddingBottom: 96,
} as const;

export function ProfileTabs({ profile, listings, reviews }: Props) {
  const [tab, setTab] = useState("listings");
  const muted = useThemeColor("mutedForeground");

  return (
    <Tabs value={tab} onValueChange={setTab} variant="line" swipeable fill>
      <View className="bg-background">
        <TabsList>
          <TabsTrigger value="listings">
            <View className="flex-row items-center gap-1.5">
              <PackageOpen size={14} color={muted} />
              <Text className="text-sm font-medium">Annonces</Text>
            </View>
          </TabsTrigger>
          <TabsTrigger value="reviews">
            <View className="flex-row items-center gap-1.5">
              <Star size={14} color={muted} />
              <Text className="text-sm font-medium">Avis</Text>
            </View>
          </TabsTrigger>
          <TabsTrigger value="about">
            <View className="flex-row items-center gap-1.5">
              <Info size={14} color={muted} />
              <Text className="text-sm font-medium">À propos</Text>
            </View>
          </TabsTrigger>
        </TabsList>
      </View>

      <TabsContent value="listings">
        <ScrollView
          contentContainerStyle={PANEL_CONTENT_STYLE}
          showsVerticalScrollIndicator={false}
        >
          <ListingsTab listings={listings} />
        </ScrollView>
      </TabsContent>

      <TabsContent value="reviews">
        <ScrollView
          contentContainerStyle={PANEL_CONTENT_STYLE}
          showsVerticalScrollIndicator={false}
        >
          <ReviewsTab reviews={reviews} />
        </ScrollView>
      </TabsContent>

      <TabsContent value="about">
        <ScrollView
          contentContainerStyle={PANEL_CONTENT_STYLE}
          showsVerticalScrollIndicator={false}
        >
          <AboutTab profile={profile} />
        </ScrollView>
      </TabsContent>
    </Tabs>
  );
}

function ListingsTab({ listings }: { listings: Listing[] }) {
  if (listings.length === 0) {
    return (
      <EmptyState
        icon={<PackageOpen size={28} />}
        title="Aucune annonce active"
        description="Ce vendeur n'a pas encore publié d'annonce."
      />
    );
  }

  return (
    <View className="gap-3">
      <Text variant="muted" className="text-sm">
        {listings.length} article{listings.length > 1 ? "s" : ""}
      </Text>
      <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
        {listings.map((listing) => (
          <View key={listing.id} style={{ width: "50%", padding: 6 }}>
            <ListingCard item={listing as unknown as FeedItem} />
          </View>
        ))}
      </View>
    </View>
  );
}

function ReviewsTab({ reviews }: { reviews: ReviewWithReviewer[] }) {
  const avgRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  }, [reviews]);

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={<Star size={28} />}
        title="Aucun avis pour le moment"
        description="Ce vendeur n'a pas encore reçu d'évaluation."
      />
    );
  }

  return (
    <View className="gap-5">
      <View className="flex-row items-center gap-4">
        <Text variant="h1" className="tabular-nums">
          {avgRating.toFixed(1)}
        </Text>
        <View className="gap-1">
          <StarRating rating={avgRating} size="lg" />
          <Text variant="muted" className="text-sm">
            {reviews.length} avis
          </Text>
        </View>
      </View>

      <View className="gap-4">
        {reviews.map((review, idx) => (
          <View
            key={review.id}
            className={`gap-2 ${idx > 0 ? "border-t border-border pt-4" : ""}`}
          >
            <View className="flex-row items-center gap-3">
              <Avatar
                uri={review.reviewer?.avatar_url}
                fallback={review.reviewer?.username?.charAt(0) || "?"}
                size={32}
              />
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-medium" numberOfLines={1}>
                    {review.reviewer?.username ?? "Utilisateur supprimé"}
                  </Text>
                  <Text variant="caption" className="text-xs">
                    {formatRelativeDate(review.created_at)}
                  </Text>
                </View>
                <StarRating rating={review.rating} size="sm" />
              </View>
            </View>
            {review.comment ? (
              <Text variant="muted" className="pl-11 text-sm leading-5">
                {review.comment}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function AboutTab({ profile }: { profile: Profile }) {
  const memberSince = useMemo(() => {
    if (!profile.created_at) return "—";
    try {
      return format(new Date(profile.created_at), "MMMM yyyy", { locale: fr });
    } catch {
      return "—";
    }
  }, [profile.created_at]);

  const muted = useThemeColor("mutedForeground");
  const flag = profile.country_code
    ? countryCodeToFlag(profile.country_code)
    : "";
  const region = profile.country_code
    ? regionDisplayName(profile.country_code, "fr")
    : "";

  const hasSocials =
    profile.instagram_url || profile.facebook_url || profile.tiktok_url;

  return (
    <View className="gap-5 pt-4">
      <View className="items-center gap-2">
        <Avatar
          uri={profile.avatar_url}
          fallback={profile.username.charAt(0)}
          size={96}
        />
        <Text variant="h3">{profile.username}</Text>
      </View>

      <View className="flex-row flex-wrap items-center justify-center gap-4">
        {profile.country_code ? (
          <View className="flex-row items-center gap-1.5">
            <MapPin size={14} color={muted} />
            <Text variant="muted" className="text-sm">
              {flag} {region}
            </Text>
          </View>
        ) : null}
        <View className="flex-row items-center gap-1.5">
          <Calendar size={14} color={muted} />
          <Text variant="muted" className="text-sm">
            Membre depuis {memberSince}
          </Text>
        </View>
      </View>

      {profile.bio ? (
        <Text className="max-w-md self-center text-center text-sm leading-5">
          {profile.bio}
        </Text>
      ) : null}

      {hasSocials ? (
        <View className="flex-row items-center justify-center gap-5">
          {profile.instagram_url ? (
            <Pressable
              onPress={() => Linking.openURL(profile.instagram_url!)}
              hitSlop={8}
            >
              <InstagramIcon color={muted} />
            </Pressable>
          ) : null}
          {profile.facebook_url ? (
            <Pressable
              onPress={() => Linking.openURL(profile.facebook_url!)}
              hitSlop={8}
            >
              <FacebookIcon color={muted} />
            </Pressable>
          ) : null}
          {profile.tiktok_url ? (
            <Pressable
              onPress={() => Linking.openURL(profile.tiktok_url!)}
              hitSlop={8}
            >
              <TikTokIcon color={muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
