import { ScrollView, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Heart, ChevronLeft, Share2 } from "lucide-react-native";
import { Pressable } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { formatPrice, formatRelativeDate } from "@pokemarket/shared";
import { useListing } from "@/hooks/use-listings";
import {
  useFavoriteListingIds,
  useToggleFavorite,
} from "@/hooks/use-favorites";
import { useAuth } from "@/hooks/use-auth";
import { fetchOrCreateConversation } from "@/lib/api/conversations";
import { ImageCarousel } from "@/components/listing/image-carousel";
import { SellerBlock } from "@/components/listing/seller-block";
import { ListingActions } from "@/components/listing/listing-actions";
import { Badge, Skeleton, Text, toast } from "@/components/ui";

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: listing, isLoading } = useListing(id);
  const { user } = useAuth();
  const { data: favIds = [] } = useFavoriteListingIds();
  const toggleFavorite = useToggleFavorite();
  const isFavorite = favIds.includes(id);

  const contactMutation = useMutation({
    mutationFn: (listingId: string) => fetchOrCreateConversation(listingId),
    onSuccess: (conversationId) => {
      router.push(`/inbox/${conversationId}`);
    },
    onError: () => toast.error("Impossible d'ouvrir la conversation"),
  });

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

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="relative">
          <ImageCarousel images={images} />
          <SafeAreaView
            className="absolute inset-x-0 top-0"
            edges={["top"]}
            pointerEvents="box-none"
          >
            <View className="flex-row items-center justify-between px-4 pt-2">
              <Pressable
                onPress={() => {
                  if (router.canGoBack()) router.back();
                  else router.replace("/(tabs)");
                }}
                hitSlop={8}
                className="h-10 w-10 items-center justify-center rounded-full bg-white/90"
              >
                <ChevronLeft size={22} color="#0f172a" />
              </Pressable>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => toggleFavorite.mutate(id)}
                  hitSlop={8}
                  className="h-10 w-10 items-center justify-center rounded-full bg-white/90"
                >
                  <Heart
                    size={20}
                    color="#E63946"
                    fill={isFavorite ? "#E63946" : "transparent"}
                  />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  className="h-10 w-10 items-center justify-center rounded-full bg-white/90"
                >
                  <Share2 size={18} color="#0f172a" />
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
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
        </View>
      </ScrollView>
    </View>
  );
}
