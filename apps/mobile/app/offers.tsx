import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MotiView } from "moti";
import {
  Ban,
  Check,
  Clock,
  CreditCard,
  Inbox,
  Send,
  Tag,
  X,
} from "lucide-react-native";

import {
  queryKeys,
  formatPrice,
  formatRelativeDate,
  type OfferWithContext,
  type SentOfferWithContext,
} from "@pokemarket/shared";
import { useAuth } from "@/hooks/use-auth";
import { useRealtime } from "@/hooks/use-realtime";
import {
  acceptOffer,
  cancelOffer,
  fetchReceivedOffers,
  fetchSentOffers,
  rejectOffer,
} from "@/lib/api/offers";
import {
  Avatar,
  Badge,
  Button,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  toast,
} from "@/components/ui";
import { MobileHeader } from "@/components/layout/mobile-header";
import { EmptyState, ErrorState } from "@/components/shared";
import { duration, fadeInUp, staggerDelay } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { useThemeColors } from "@/lib/theme-colors";

type StatusKey = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";

type StatusConfig = {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  Icon: React.ComponentType<{ size: number; color: string }>;
  iconColor: string;
};

// Resolves the icon colour from live tokens so the badge stays legible
// in both light and dark themes. Mirrors the same pattern as the wallet's
// KYC badge — the variant string drives the bg, the resolved hex drives
// the lucide icon stroke.
function useStatusConfig(): Record<StatusKey, StatusConfig> {
  const colors = useThemeColors();
  return {
    PENDING: {
      label: "En attente",
      variant: "secondary",
      Icon: Clock,
      iconColor: colors.mutedForeground,
    },
    ACCEPTED: {
      label: "Acceptée",
      variant: "default",
      Icon: Check,
      iconColor: colors.primaryForeground,
    },
    REJECTED: {
      label: "Refusée",
      variant: "destructive",
      Icon: X,
      iconColor: colors.destructive,
    },
    CANCELLED: {
      label: "Annulée",
      variant: "outline",
      Icon: Ban,
      iconColor: colors.mutedForeground,
    },
  };
}

function OfferStatusBadge({ status }: { status: string }) {
  const config = useStatusConfig()[status as StatusKey];
  if (!config) return null;
  const { Icon, iconColor, label, variant } = config;

  return (
    <Badge variant={variant}>
      <View className="flex-row items-center gap-1">
        <Icon size={11} color={iconColor} />
        <Text
          className={`text-[10px] font-medium ${
            variant === "default"
              ? "text-primary-foreground"
              : variant === "destructive"
                ? "text-destructive"
                : variant === "outline"
                  ? "text-foreground"
                  : "text-secondary-foreground"
          }`}
        >
          {label}
        </Text>
      </View>
    </Badge>
  );
}

function OfferCardSkeleton() {
  return (
    <View className="flex-row gap-3 rounded-2xl border border-border bg-card p-3">
      <Skeleton className="size-16 rounded-lg" />
      <View className="flex-1 gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-16" />
      </View>
    </View>
  );
}

function CardThumbnail({
  uri,
  listingId,
}: {
  uri: string | null;
  listingId: string;
}) {
  const mutedFg = useThemeColors().mutedForeground;
  return (
    <Pressable
      onPress={() => router.push(`/listing/${listingId}`)}
      className="size-16 overflow-hidden rounded-lg bg-muted"
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: 64, height: 64 }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View className="size-full items-center justify-center">
          <Tag size={18} color={mutedFg} />
        </View>
      )}
    </Pressable>
  );
}

function ReceivedOfferCard({
  offer,
  index,
}: {
  offer: OfferWithContext;
  index: number;
}) {
  const queryClient = useQueryClient();
  const colors = useThemeColors();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.offers.received() });
    queryClient.invalidateQueries({ queryKey: queryKeys.offers.sent() });
    queryClient.invalidateQueries({
      queryKey: queryKeys.listings.detail(offer.listing_id),
    });
  }, [queryClient, offer.listing_id]);

  const acceptMut = useMutation({
    mutationFn: () =>
      acceptOffer(
        offer.id,
        offer.listing_id,
        offer.buyer_id,
        offer.offer_amount,
        offer.conversation_id!,
      ),
    onSuccess: () => {
      haptic("success");
      toast.success("Offre acceptée !");
      invalidate();
    },
    onError: () => {
      haptic("error");
      toast.error("Impossible d'accepter l'offre");
    },
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectOffer(offer.id, offer.conversation_id!),
    onSuccess: () => {
      haptic("success");
      toast.success("Offre refusée");
      invalidate();
    },
    onError: () => {
      haptic("error");
      toast.error("Impossible de refuser l'offre");
    },
  });

  const isMutating = acceptMut.isPending || rejectMut.isPending;

  return (
    <MotiView
      from={fadeInUp.from}
      animate={fadeInUp.animate}
      transition={{
        type: "timing",
        duration: duration.fast,
        delay: staggerDelay(index, 25, 10),
      }}
    >
      <View className="flex-row gap-3 rounded-2xl border border-border bg-card p-3">
        <CardThumbnail
          uri={offer.listing.cover_image_url}
          listingId={offer.listing_id}
        />

        <View className="flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <Text className="text-sm font-semibold">
                {formatPrice(offer.offer_amount)}
              </Text>
              <Text numberOfLines={1} className="text-xs text-muted-foreground">
                {offer.listing.title}
              </Text>
            </View>
            <OfferStatusBadge status={offer.status ?? "PENDING"} />
          </View>

          <View className="mt-1.5 flex-row items-center gap-1.5">
            <Avatar
              uri={offer.buyer.avatar_url}
              fallback={offer.buyer.username}
              size={18}
            />
            <Text className="flex-1 text-xs text-muted-foreground">
              {offer.buyer.username}
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              {formatRelativeDate(offer.created_at ?? "")}
            </Text>
          </View>

          {offer.status === "PENDING" ? (
            <View className="mt-2 flex-row gap-2">
              <Button
                size="sm"
                onPress={() => {
                  haptic("confirm");
                  acceptMut.mutate();
                }}
                disabled={isMutating}
                loading={acceptMut.isPending}
                leftIcon={<Check size={14} color={colors.primaryForeground} />}
              >
                Accepter
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onPress={() => {
                  haptic("confirm");
                  rejectMut.mutate();
                }}
                disabled={isMutating}
                loading={rejectMut.isPending}
                leftIcon={<X size={14} color={colors.destructiveForeground} />}
              >
                Refuser
              </Button>
            </View>
          ) : null}
        </View>
      </View>
    </MotiView>
  );
}

function SentOfferCard({
  offer,
  index,
}: {
  offer: SentOfferWithContext;
  index: number;
}) {
  const queryClient = useQueryClient();
  const colors = useThemeColors();

  const cancelMut = useMutation({
    mutationFn: () => cancelOffer(offer.id, offer.conversation_id!),
    onSuccess: () => {
      haptic("success");
      toast.success("Offre annulée");
      queryClient.invalidateQueries({ queryKey: queryKeys.offers.sent() });
      queryClient.invalidateQueries({ queryKey: queryKeys.offers.received() });
    },
    onError: () => {
      haptic("error");
      toast.error("Impossible d'annuler l'offre");
    },
  });

  return (
    <MotiView
      from={fadeInUp.from}
      animate={fadeInUp.animate}
      transition={{
        type: "timing",
        duration: duration.fast,
        delay: staggerDelay(index, 25, 10),
      }}
    >
      <View className="flex-row gap-3 rounded-2xl border border-border bg-card p-3">
        <CardThumbnail
          uri={offer.listing.cover_image_url}
          listingId={offer.listing_id}
        />

        <View className="flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <Text className="text-sm font-semibold">
                {formatPrice(offer.offer_amount)}
              </Text>
              <Text numberOfLines={1} className="text-xs text-muted-foreground">
                {offer.listing.title}
              </Text>
            </View>
            <OfferStatusBadge status={offer.status ?? "PENDING"} />
          </View>

          <View className="mt-1.5 flex-row items-center gap-1.5">
            <Avatar
              uri={offer.listing.seller.avatar_url}
              fallback={offer.listing.seller.username}
              size={18}
            />
            <Text className="flex-1 text-xs text-muted-foreground">
              {offer.listing.seller.username}
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              {formatRelativeDate(offer.created_at ?? "")}
            </Text>
          </View>

          {offer.status === "PENDING" ? (
            <View className="mt-2 flex-row">
              <Button
                size="sm"
                variant="outline"
                onPress={() => {
                  haptic("confirm");
                  cancelMut.mutate();
                }}
                disabled={cancelMut.isPending}
                loading={cancelMut.isPending}
                leftIcon={<X size={14} color={colors.foreground} />}
              >
                Annuler
              </Button>
            </View>
          ) : null}

          {offer.status === "ACCEPTED" ? (
            <View className="mt-2 flex-row gap-2">
              <Button
                size="sm"
                variant="outline"
                onPress={() => {
                  haptic("confirm");
                  cancelMut.mutate();
                }}
                disabled={cancelMut.isPending}
                loading={cancelMut.isPending}
              >
                Annuler
              </Button>
              <Button
                size="sm"
                onPress={() => router.push(`/checkout/${offer.listing_id}`)}
                leftIcon={
                  <CreditCard size={14} color={colors.primaryForeground} />
                }
              >
                {`Payer ${formatPrice(offer.offer_amount)}`}
              </Button>
            </View>
          ) : null}
        </View>
      </View>
    </MotiView>
  );
}

export default function OffersScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const colors = useThemeColors();
  const [tab, setTab] = useState<"received" | "sent">("received");

  const {
    data: received,
    isLoading: loadingReceived,
    error: errorReceived,
    refetch: refetchReceived,
    isRefetching: refReceived,
  } = useQuery({
    queryKey: queryKeys.offers.received(),
    queryFn: fetchReceivedOffers,
    enabled: !!user,
  });

  const {
    data: sent,
    isLoading: loadingSent,
    error: errorSent,
    refetch: refetchSent,
    isRefetching: refSent,
  } = useQuery({
    queryKey: queryKeys.offers.sent(),
    queryFn: fetchSentOffers,
    enabled: !!user,
  });

  const invalidateOffers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.offers.received() });
    queryClient.invalidateQueries({ queryKey: queryKeys.offers.sent() });
  }, [queryClient]);

  useRealtime({
    channelName: `offers-dashboard-${user?.id ?? "anon"}`,
    table: "offers",
    event: "*",
    onInsert: invalidateOffers,
    onUpdate: invalidateOffers,
    enabled: !!user,
  });

  const pendingReceivedCount =
    received?.filter((o) => o.status === "PENDING").length ?? 0;
  const pendingSentCount =
    sent?.filter((o) => o.status === "PENDING").length ?? 0;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <MobileHeader title="Mes offres" fallbackHref="/(tabs)/inbox" />

      <SafeAreaView edges={["bottom"]} className="flex-1">
        <View className="px-4 pt-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="received">
                <View className="flex-row items-center gap-1.5">
                  <Inbox size={14} color={colors.foreground} />
                  <Text className="text-sm font-medium">Reçues</Text>
                  {pendingReceivedCount > 0 ? (
                    <View className="ml-1 h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1">
                      <Text className="text-[10px] font-bold text-primary-foreground">
                        {pendingReceivedCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </TabsTrigger>
              <TabsTrigger value="sent">
                <View className="flex-row items-center gap-1.5">
                  <Send size={14} color={colors.foreground} />
                  <Text className="text-sm font-medium">Envoyées</Text>
                  {pendingSentCount > 0 ? (
                    <View className="ml-1 h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1">
                      <Text className="text-[10px] font-bold text-primary-foreground">
                        {pendingSentCount}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="received">
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 32, gap: 12 }}
                refreshControl={
                  <RefreshControl
                    refreshing={refReceived}
                    onRefresh={refetchReceived}
                    tintColor={colors.primary}
                  />
                }
              >
                {loadingReceived ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <OfferCardSkeleton key={i} />
                  ))
                ) : errorReceived ? (
                  <ErrorState
                    variant="card"
                    title="Impossible de charger vos offres reçues"
                    description={
                      errorReceived instanceof Error
                        ? errorReceived.message
                        : "Réessayez dans un instant."
                    }
                    action={{
                      label: "Réessayer",
                      onPress: () => void refetchReceived(),
                    }}
                  />
                ) : received && received.length > 0 ? (
                  received.map((offer, i) => (
                    <ReceivedOfferCard key={offer.id} offer={offer} index={i} />
                  ))
                ) : (
                  <EmptyState
                    icon={<Tag size={22} color={colors.mutedForeground} />}
                    title="Aucune offre reçue"
                    description="Les offres faites sur vos annonces apparaîtront ici."
                  />
                )}
              </ScrollView>
            </TabsContent>

            <TabsContent value="sent">
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 32, gap: 12 }}
                refreshControl={
                  <RefreshControl
                    refreshing={refSent}
                    onRefresh={refetchSent}
                    tintColor={colors.primary}
                  />
                }
              >
                {loadingSent ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <OfferCardSkeleton key={i} />
                  ))
                ) : errorSent ? (
                  <ErrorState
                    variant="card"
                    title="Impossible de charger vos offres envoyées"
                    description={
                      errorSent instanceof Error
                        ? errorSent.message
                        : "Réessayez dans un instant."
                    }
                    action={{
                      label: "Réessayer",
                      onPress: () => void refetchSent(),
                    }}
                  />
                ) : sent && sent.length > 0 ? (
                  sent.map((offer, i) => (
                    <SentOfferCard key={offer.id} offer={offer} index={i} />
                  ))
                ) : (
                  <EmptyState
                    icon={<Tag size={22} color={colors.mutedForeground} />}
                    title="Aucune offre envoyée"
                    description="Parcourez les annonces et faites des offres aux vendeurs !"
                    action={{
                      label: "Explorer le marché",
                      onPress: () => router.push("/(tabs)"),
                    }}
                  />
                )}
              </ScrollView>
            </TabsContent>
          </Tabs>
        </View>
      </SafeAreaView>
    </View>
  );
}
