import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { MotiView } from "moti";
import {
  Ban,
  Check,
  ChevronLeft,
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

type StatusKey = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";

const STATUS_CONFIG: Record<
  StatusKey,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    Icon: React.ComponentType<{ size: number; color: string }>;
    iconColor: string;
  }
> = {
  PENDING: { label: "En attente", variant: "secondary", Icon: Clock, iconColor: "#64748b" },
  ACCEPTED: { label: "Acceptée", variant: "default", Icon: Check, iconColor: "#fff" },
  REJECTED: { label: "Refusée", variant: "destructive", Icon: X, iconColor: "#dc2626" },
  CANCELLED: { label: "Annulée", variant: "outline", Icon: Ban, iconColor: "#64748b" },
};

function OfferStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as StatusKey];
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
              ? "text-red-800"
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
          <Tag size={18} color="#94a3b8" />
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
      toast.success("Offre acceptée !");
      invalidate();
    },
    onError: () => toast.error("Impossible d'accepter l'offre"),
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectOffer(offer.id, offer.conversation_id!),
    onSuccess: () => {
      toast.success("Offre refusée");
      invalidate();
    },
    onError: () => toast.error("Impossible de refuser l'offre"),
  });

  const isMutating = acceptMut.isPending || rejectMut.isPending;

  return (
    <MotiView
      from={{ opacity: 0, translateY: 6 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 220, delay: index * 25 }}
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
              <Text
                numberOfLines={1}
                className="text-xs text-muted-foreground"
              >
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
                onPress={() => acceptMut.mutate()}
                disabled={isMutating}
                loading={acceptMut.isPending}
                leftIcon={<Check size={14} color="#fff" />}
              >
                Accepter
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onPress={() => rejectMut.mutate()}
                disabled={isMutating}
                loading={rejectMut.isPending}
                leftIcon={<X size={14} color="#fff" />}
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

  const cancelMut = useMutation({
    mutationFn: () => cancelOffer(offer.id, offer.conversation_id!),
    onSuccess: () => {
      toast.success("Offre annulée");
      queryClient.invalidateQueries({ queryKey: queryKeys.offers.sent() });
      queryClient.invalidateQueries({ queryKey: queryKeys.offers.received() });
    },
    onError: () => toast.error("Impossible d'annuler l'offre"),
  });

  return (
    <MotiView
      from={{ opacity: 0, translateY: 6 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 220, delay: index * 25 }}
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
              <Text
                numberOfLines={1}
                className="text-xs text-muted-foreground"
              >
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
                onPress={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
                loading={cancelMut.isPending}
                leftIcon={<X size={14} color="#0f172a" />}
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
                onPress={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
                loading={cancelMut.isPending}
              >
                Annuler
              </Button>
              <Button
                size="sm"
                onPress={() => router.push(`/checkout/${offer.listing_id}`)}
                leftIcon={<CreditCard size={14} color="#fff" />}
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
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-row items-center gap-2 border-b border-border bg-background px-2 py-2">
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)/inbox");
          }}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full"
        >
          <ChevronLeft size={22} color="#0f172a" />
        </Pressable>
        <Text variant="h3" className="flex-1">
          Mes offres
        </Text>
      </View>

      <View className="px-4 pt-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="received">
              <View className="flex-row items-center gap-1.5">
                <Inbox size={14} color="#0f172a" />
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
                <Send size={14} color="#0f172a" />
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
                  tintColor="#E63946"
                />
              }
            >
              {loadingReceived ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <OfferCardSkeleton key={i} />
                ))
              ) : errorReceived ? (
                <EmptyBlock
                  title="Erreur de chargement"
                  description="Impossible de charger vos offres reçues."
                  ctaLabel="Réessayer"
                  onCta={invalidateOffers}
                />
              ) : received && received.length > 0 ? (
                received.map((offer, i) => (
                  <ReceivedOfferCard key={offer.id} offer={offer} index={i} />
                ))
              ) : (
                <EmptyBlock
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
                  tintColor="#E63946"
                />
              }
            >
              {loadingSent ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <OfferCardSkeleton key={i} />
                ))
              ) : errorSent ? (
                <EmptyBlock
                  title="Erreur de chargement"
                  description="Impossible de charger vos offres envoyées."
                  ctaLabel="Réessayer"
                  onCta={invalidateOffers}
                />
              ) : sent && sent.length > 0 ? (
                sent.map((offer, i) => (
                  <SentOfferCard key={offer.id} offer={offer} index={i} />
                ))
              ) : (
                <EmptyBlock
                  title="Aucune offre envoyée"
                  description="Parcourez les annonces et faites des offres aux vendeurs !"
                  ctaLabel="Explorer le marché"
                  onCta={() => router.push("/(tabs)")}
                />
              )}
            </ScrollView>
          </TabsContent>
        </Tabs>
      </View>
    </SafeAreaView>
  );
}

function EmptyBlock({
  title,
  description,
  ctaLabel,
  onCta,
}: {
  title: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <View className="items-center gap-2 py-16">
      <View className="size-12 items-center justify-center rounded-full bg-muted">
        <Tag size={20} color="#94a3b8" />
      </View>
      <Text variant="h4" className="text-center">
        {title}
      </Text>
      <Text variant="muted" className="text-center">
        {description}
      </Text>
      {ctaLabel && onCta ? (
        <Button onPress={onCta} className="mt-2">
          {ctaLabel}
        </Button>
      ) : null}
    </View>
  );
}
