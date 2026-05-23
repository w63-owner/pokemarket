import { Platform, Pressable, ScrollView, Share, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Heart, Share2 } from "lucide-react-native";
import { useMutation } from "@tanstack/react-query";
import { formatPrice, formatRelativeDate } from "@pokemarket/shared";

import { useListing, useSellerReputation } from "@/hooks/use-listings";
import {
  useFavoriteListingIds,
  useToggleFavorite,
} from "@/hooks/use-favorites";
import { useAuth } from "@/hooks/use-auth";
import { fetchOrCreateConversation } from "@/lib/api/conversations";
import { ImageCarousel } from "@/components/listing/image-carousel";
import { SellerBlock } from "@/components/listing/seller-block";
import { ListingActions } from "@/components/listing/listing-actions";
import { PriceHistoryChart } from "@/components/listing/price-history-chart";
import { ReportDialog } from "@/components/listing/report-dialog";
import { MobileHeader } from "@/components/layout/mobile-header";
import { Badge, Skeleton, Text, toast } from "@/components/ui";
import { useEffectiveTheme } from "@/lib/stores/theme";
import { haptic } from "@/lib/haptics";
import { env } from "@/lib/env";

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: listing, isLoading } = useListing(id);
  const { user } = useAuth();
  const { data: favIds = [] } = useFavoriteListingIds();
  const { data: reputation } = useSellerReputation(listing?.seller_id);
  const toggleFavorite = useToggleFavorite();
  const isFavorite = favIds.includes(id);

  const contactMutation = useMutation({
    mutationFn: (listingId: string) => fetchOrCreateConversation(listingId),
    onSuccess: (conversationId) => {
      router.push(`/inbox/${conversationId}`);
    },
    onError: () => toast.error("Impossible d'ouvrir la conversation"),
  });

  const handleShare = async () => {
    if (!listing) return;
    const base = env.API_URL.replace(/\/$/, "");
    const url = `${base}/listing/${listing.id}`;
    const priceLabel = formatPrice(listing.display_price ?? 0);
    try {
      await Share.share({
        title: listing.title,
        message: `${listing.title} — ${priceLabel} sur PokeMarket : ${url}`,
        url,
      });
    } catch {
      // User cancelled or platform error – nothing to surface.
    }
  };

  if (isLoading || !listing) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Stack.Screen options={{ headerShown: false }} />
        <Skeleton className="h-96 w-full" />
        <View className="gap-3 p-4">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-16 w-full" />
        </View>
      </SafeAreaView>
    );
  }

  const images = [listing.cover_image_url, listing.back_image_url].filter(
    Boolean,
  ) as string[];

  const isOwner = !!user && user.id === listing.seller_id;
  const sellerRating =
    reputation && reputation.reviewCount > 0 ? reputation.avgRating : null;
  const sellerReviewCount = reputation?.reviewCount ?? 0;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="relative">
          <ImageCarousel images={images} />
          <MobileHeader
            variant="transparent"
            fallbackHref="/(tabs)"
            rightAction={
              <View className="flex-row gap-2">
                <OverlayIconButton
                  onPress={() => {
                    haptic("tap");
                    if (!user) {
                      router.push("/(auth)/login");
                      return;
                    }
                    toggleFavorite.mutate(id);
                  }}
                  accessibilityLabel="Ajouter aux favoris"
                >
                  <Heart
                    size={20}
                    color="#E63946"
                    fill={isFavorite ? "#E63946" : "transparent"}
                  />
                </OverlayIconButton>
                <OverlayIconButton
                  onPress={handleShare}
                  accessibilityLabel="Partager"
                >
                  <Share2 size={18} color="#ffffff" />
                </OverlayIconButton>
              </View>
            }
          />
        </View>

        <View className="gap-4 p-4">
          <View className="gap-1">
            {listing.is_graded && listing.grading_company ? (
              <Badge variant="secondary">
                {`${listing.grading_company} ${listing.grade_note ?? ""}`}
              </Badge>
            ) : null}
            <Text variant="h3">{listing.title}</Text>
            <View className="mt-1 flex-row items-baseline gap-2">
              <Text className="text-3xl font-bold text-primary">
                {formatPrice(listing.display_price ?? 0)}
              </Text>
              {listing.created_at ? (
                <Text variant="caption">
                  Mise en ligne {formatRelativeDate(listing.created_at)}
                </Text>
              ) : null}
            </View>
          </View>

          <ListingActions
            listing={listing}
            viewerId={user?.id ?? null}
            onContact={() => {
              if (!user) {
                router.push("/(auth)/login");
                return;
              }
              if (user.id === listing.seller_id) return;
              contactMutation.mutate(listing.id);
            }}
          />

          <SellerBlock
            username={listing.seller.username ?? "vendeur"}
            avatarUrl={listing.seller.avatar_url}
            rating={sellerRating}
            reviewCount={sellerReviewCount}
          />

          {listing.condition ? (
            <View className="rounded-2xl border border-border bg-card p-4">
              <Text variant="caption">État</Text>
              <Text className="mt-1 font-semibold">{listing.condition}</Text>
            </View>
          ) : null}

          {listing.card_series || listing.card_number ? (
            <View className="rounded-2xl border border-border bg-card p-4">
              <Text variant="caption">Détails carte</Text>
              {listing.card_series ? (
                <Text className="mt-1">Set : {listing.card_series}</Text>
              ) : null}
              {listing.card_number ? (
                <Text className="mt-1">N° : {listing.card_number}</Text>
              ) : null}
              {listing.card_language ? (
                <Text className="mt-1">Langue : {listing.card_language}</Text>
              ) : null}
              {listing.card_rarity ? (
                <Text className="mt-1">Rareté : {listing.card_rarity}</Text>
              ) : null}
            </View>
          ) : null}

          {listing.card_ref_id ? (
            <PriceHistoryChart
              cardKey={listing.card_ref_id}
              condition={listing.condition}
              language={listing.card_language}
              isGraded={listing.is_graded ?? false}
            />
          ) : null}

          {!isOwner ? (
            <View className="mt-2 flex-row justify-end">
              <ReportDialog listingId={listing.id} />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Glassy circular icon button used by the listing-detail header. Mirrors
 * the back-button overlay variant so all three CTAs (back / favorite /
 * share) share the same visual language over the cover photo.
 */
function OverlayIconButton({
  children,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useEffectiveTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={30}
          tint={theme === "dark" ? "dark" : "light"}
          style={{
            height: 40,
            width: 40,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            backgroundColor: "rgba(0,0,0,0.30)",
          }}
        >
          {children}
        </BlurView>
      ) : (
        <View
          style={{
            height: 40,
            width: 40,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.40)",
          }}
        >
          {children}
        </View>
      )}
    </Pressable>
  );
}
