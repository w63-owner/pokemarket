import { useMemo } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Hash,
  MapPin,
  Package,
  Receipt,
  Truck,
  User as UserIcon,
} from "lucide-react-native";
import {
  CONDITION_LABELS,
  formatPrice,
  type CardCondition,
} from "@pokemarket/shared";

import { useAuth } from "@/hooks/use-auth";
import { useSaleDetail } from "@/hooks/use-transactions";
import { supabase } from "@/lib/supabase";
import { fadeInUp } from "@/lib/motion";
import { TransactionActions } from "@/components/messages";
import { Badge, Card, Separator, Skeleton, Text } from "@/components/ui";
import { MobileHeader } from "@/components/layout/mobile-header";
import { ErrorState } from "@/components/shared";
import { useThemeColors } from "@/lib/theme-colors";

type StatusConfig = {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline" | "warning";
  Icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
};

// Reactive variant of the status map: each entry's `color` is resolved
// against the live palette so the badge icon stroke stays legible in
// both light and dark themes. The variant strings still drive the
// badge background, the resolved hex drives the lucide icon.
function useStatusConfigMap(): Record<string, StatusConfig> {
  const colors = useThemeColors();
  return {
    PENDING_PAYMENT: {
      label: "En attente de paiement",
      variant: "outline",
      Icon: CreditCard,
      color: colors.mutedForeground,
    },
    PAID: {
      label: "Payée — En attente d'expédition",
      variant: "default",
      Icon: Package,
      color: colors.primaryForeground,
    },
    SHIPPED: {
      label: "Expédiée",
      variant: "secondary",
      Icon: Truck,
      color: colors.foreground,
    },
    COMPLETED: {
      label: "Finalisée",
      variant: "default",
      Icon: CheckCircle2,
      color: colors.primaryForeground,
    },
    CANCELLED: {
      label: "Annulée",
      variant: "destructive",
      Icon: Package,
      color: colors.destructiveForeground,
    },
    REFUNDED: {
      label: "Remboursée",
      variant: "outline",
      Icon: Package,
      color: colors.mutedForeground,
    },
    DISPUTED: {
      label: "Litige en cours",
      variant: "destructive",
      Icon: Package,
      color: colors.destructiveForeground,
    },
  };
}

function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const colors = useThemeColors();
  const statusConfigMap = useStatusConfigMap();

  const { data: sale, isLoading, isError, error, refetch } = useSaleDetail(id);

  // Resolve the conversation associated with the sale (listing + buyer +
  // seller is unique). Required so that ship/dispute/confirm actions can
  // post a system message into the buyer's chat thread; without it the
  // mutations succeed but the buyer wouldn't see the status update.
  const conversationQuery = useQuery({
    queryKey: ["sale", "conversation", sale?.id],
    enabled:
      !!sale &&
      (sale.status === "PAID" || sale.status === "SHIPPED") &&
      !!sale.buyer?.id &&
      !!sale.seller_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id")
        .eq("listing_id", sale!.listing_id)
        .eq("buyer_id", sale!.buyer_id)
        .eq("seller_id", sale!.seller_id)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
  });

  const conversationLink = useMemo(() => {
    if (conversationQuery.data) return `/inbox/${conversationQuery.data}`;
    if (sale?.listing?.id) return `/listing/${sale.listing.id}`;
    return null;
  }, [sale, conversationQuery.data]);

  if (!isLoading && isError) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <MobileHeader title="Erreur" fallbackHref="/transactions" />
        <View className="flex-1 justify-center px-4">
          <ErrorState
            variant="card"
            title="Vente inaccessible"
            description={
              error instanceof Error ? error.message : "Réessayez plus tard."
            }
            action={{
              label: "Réessayer",
              onPress: () => void refetch(),
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) return <SaleDetailSkeleton />;

  if (!sale) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center px-6">
          <Receipt size={40} color={colors.mutedForeground} />
          <Text variant="h3" className="mt-4 text-center">
            Vente introuvable
          </Text>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/transactions");
            }}
            className="mt-6 rounded-full bg-primary px-4 py-2"
          >
            <Text className="font-semibold text-primary-foreground">
              Retour
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const statusKey = sale.status ?? "PENDING_PAYMENT";
  const statusConfig: StatusConfig = statusConfigMap[statusKey] ?? {
    label: statusKey,
    variant: "outline",
    Icon: Package,
    color: colors.mutedForeground,
  };
  const StatusIcon = statusConfig.Icon;
  const netEarnings = sale.total_amount - sale.fee_amount;
  const hasShippingAddress =
    !!sale.shipping_address_line || !!sale.shipping_address_city;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <MobileHeader title="Détail de la vente" fallbackHref="/transactions" />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <MotiView
          from={fadeInUp.from}
          animate={fadeInUp.animate}
          transition={fadeInUp.transition}
          style={{ gap: 16 }}
        >
          <View>
            <Badge
              variant={statusConfig.variant}
              className="flex-row items-center gap-1.5 self-start px-3 py-1"
            >
              <StatusIcon size={14} color={statusConfig.color} />
              <Text
                className={
                  statusConfig.variant === "default" ||
                  statusConfig.variant === "destructive"
                    ? "text-xs font-medium text-primary-foreground"
                    : "text-xs font-medium text-foreground"
                }
              >
                {statusConfig.label}
              </Text>
            </Badge>
          </View>

          {user &&
          (sale.status === "PAID" || sale.status === "SHIPPED") &&
          conversationQuery.data ? (
            <View className="overflow-hidden rounded-2xl border border-border">
              <TransactionActions
                transaction={sale}
                conversationId={conversationQuery.data}
                listingId={sale.listing_id}
                currentUserId={user.id}
                sellerId={sale.seller_id}
                buyerId={sale.buyer_id}
              />
            </View>
          ) : null}

          <Card className="gap-3">
            <View className="flex-row items-center gap-2">
              <Package size={16} color={colors.foreground} />
              <Text className="text-sm font-semibold">Carte vendue</Text>
            </View>
            <View className="flex-row gap-3">
              <View className="h-16 w-16 overflow-hidden rounded-xl bg-muted">
                {sale.listing?.cover_image_url ? (
                  <Image
                    source={{ uri: sale.listing.cover_image_url }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                    transition={150}
                  />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Package size={20} color={colors.mutedForeground} />
                  </View>
                )}
              </View>
              <View className="min-w-0 flex-1">
                <Pressable
                  onPress={() => {
                    if (conversationLink)
                      router.push(conversationLink as never);
                  }}
                >
                  <Text className="font-semibold" numberOfLines={2}>
                    {sale.listing?.title ?? sale.listing_title ?? "—"}
                  </Text>
                </Pressable>
                <View className="mt-1 flex-row flex-wrap gap-1.5">
                  {sale.listing?.condition ? (
                    <Badge variant="secondary" className="px-2 py-0.5">
                      <Text className="text-[10px] font-medium text-foreground">
                        {CONDITION_LABELS[
                          sale.listing.condition as CardCondition
                        ] ?? sale.listing.condition}
                      </Text>
                    </Badge>
                  ) : null}
                  {sale.listing?.is_graded && sale.listing?.grade_note ? (
                    <Badge variant="secondary" className="px-2 py-0.5">
                      <Text className="text-[10px] font-medium text-foreground">
                        Gradée {sale.listing.grade_note}
                      </Text>
                    </Badge>
                  ) : null}
                </View>
                <Text variant="caption" className="mt-1">
                  Vendue le {formatLongDate(sale.created_at)}
                </Text>
              </View>
            </View>
          </Card>

          <Card className="gap-3">
            <View className="flex-row items-center gap-2">
              <CreditCard size={16} color={colors.foreground} />
              <Text className="text-sm font-semibold">
                Récapitulatif financier
              </Text>
            </View>
            <View className="gap-2">
              <Row
                label="Montant total"
                value={formatPrice(sale.total_amount)}
              />
              <Row
                label="Commission PokeMarket"
                value={`-${formatPrice(sale.fee_amount)}`}
                accentClassName="text-destructive"
              />
              {(sale.shipping_cost ?? 0) > 0 ? (
                <Row
                  label="Frais de port (payés par l'acheteur)"
                  value={formatPrice(sale.shipping_cost ?? 0)}
                  mutedValue
                />
              ) : null}
              <Separator className="my-1" />
              <Row
                label="Prix net gagné"
                value={formatPrice(netEarnings)}
                accentClassName="text-success font-bold"
                bold
              />
            </View>
          </Card>

          <Card className="gap-3">
            <View className="flex-row items-center gap-2">
              <UserIcon size={16} color={colors.foreground} />
              <Text className="text-sm font-semibold">Acheteur</Text>
            </View>
            <View className="flex-row items-center gap-3">
              {sale.buyer?.avatar_url ? (
                <Image
                  source={{ uri: sale.buyer.avatar_url }}
                  style={{ width: 40, height: 40, borderRadius: 999 }}
                  contentFit="cover"
                />
              ) : (
                <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <UserIcon size={18} color={colors.mutedForeground} />
                </View>
              )}
              <Text className="text-sm font-medium">
                {sale.buyer?.username ?? "Acheteur"}
              </Text>
            </View>
          </Card>

          {hasShippingAddress ? (
            <Card className="gap-3">
              <View className="flex-row items-center gap-2">
                <MapPin size={16} color={colors.foreground} />
                <Text className="text-sm font-semibold">
                  Adresse de livraison
                </Text>
              </View>
              <View className="gap-0.5">
                {sale.shipping_address_line ? (
                  <Text className="text-sm">{sale.shipping_address_line}</Text>
                ) : null}
                <Text className="text-sm">
                  {[sale.shipping_address_postcode, sale.shipping_address_city]
                    .filter(Boolean)
                    .join(" ")}
                </Text>
                {sale.shipping_country ? (
                  <Text variant="muted" className="text-sm">
                    {sale.shipping_country}
                  </Text>
                ) : null}
              </View>
            </Card>
          ) : null}

          {sale.tracking_number ? (
            <Card className="gap-3">
              <View className="flex-row items-center gap-2">
                <Truck size={16} color={colors.foreground} />
                <Text className="text-sm font-semibold">
                  Suivi de livraison
                </Text>
              </View>
              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <Hash size={14} color={colors.mutedForeground} />
                  <Text className="font-mono text-sm" selectable>
                    {sale.tracking_number}
                  </Text>
                </View>
                {sale.tracking_url ? (
                  <Pressable
                    onPress={() =>
                      Linking.openURL(
                        /^https?:\/\//i.test(sale.tracking_url!)
                          ? sale.tracking_url!
                          : `https://${sale.tracking_url}`,
                      ).catch(() => {})
                    }
                    className="flex-row items-center gap-1.5 self-start rounded-md bg-primary px-3 py-1.5"
                  >
                    <ExternalLink size={12} color={colors.primaryForeground} />
                    <Text className="text-xs font-medium text-primary-foreground">
                      Suivre le colis
                    </Text>
                  </Pressable>
                ) : null}
                {sale.shipped_at ? (
                  <Text variant="caption">
                    Expédié le {formatLongDate(sale.shipped_at)}
                  </Text>
                ) : null}
              </View>
            </Card>
          ) : null}
        </MotiView>
      </ScrollView>
    </View>
  );
}

function Row({
  label,
  value,
  accentClassName,
  bold,
  mutedValue,
}: {
  label: string;
  value: string;
  accentClassName?: string;
  bold?: boolean;
  mutedValue?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text variant="muted" className="flex-1 pr-3 text-sm">
        {label}
      </Text>
      <Text
        className={`text-sm ${bold ? "font-semibold" : ""} ${
          accentClassName ?? ""
        } ${mutedValue ? "text-muted-foreground" : ""}`}
      >
        {value}
      </Text>
    </View>
  );
}

function SaleDetailSkeleton() {
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <MobileHeader title="Détail de la vente" fallbackHref="/transactions" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Skeleton className="h-7 w-32 rounded-full" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </ScrollView>
    </View>
  );
}
