import { useMemo } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Hash,
  Home,
  MessageCircle,
  Package,
  Receipt,
  ShoppingBag,
  Sparkles,
  Truck,
  User as UserIcon,
} from "lucide-react-native";
import {
  CONDITION_LABELS,
  formatPrice,
  type CardCondition,
} from "@pokemarket/shared";

import { useAuth } from "@/hooks/use-auth";
import { usePurchaseDetail } from "@/hooks/use-transactions";
import { supabase } from "@/lib/supabase";
import { fadeInUp } from "@/lib/motion";
import { TransactionActions } from "@/components/messages";
import { Badge, Avatar, Button, Card, Skeleton, Text } from "@/components/ui";
import { MobileHeader } from "@/components/layout/mobile-header";
import { useThemeColor } from "@/lib/theme-colors";

type StatusVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "warning";

const STATUS_META: Record<
  string,
  {
    label: string;
    variant: StatusVariant;
    Icon: React.ComponentType<{ size: number; color: string }>;
  }
> = {
  PENDING_PAYMENT: {
    label: "En attente de paiement",
    variant: "outline",
    Icon: Receipt,
  },
  PAID: {
    label: "Payée — En attente d'expédition",
    variant: "default",
    Icon: Package,
  },
  SHIPPED: { label: "Expédiée", variant: "secondary", Icon: Truck },
  COMPLETED: { label: "Finalisée", variant: "default", Icon: CheckCircle2 },
  CANCELLED: { label: "Annulée", variant: "destructive", Icon: Package },
  EXPIRED: { label: "Expirée", variant: "destructive", Icon: Package },
  REFUNDED: { label: "Remboursée", variant: "outline", Icon: Package },
  DISPUTED: { label: "Litige en cours", variant: "destructive", Icon: Package },
};

function useStatusConfig(status: string) {
  const primaryFg = useThemeColor("primaryForeground");
  const destructiveFg = useThemeColor("destructiveForeground");
  const foreground = useThemeColor("foreground");
  const mutedFg = useThemeColor("mutedForeground");

  const meta =
    STATUS_META[status] ??
    ({ label: status, variant: "outline", Icon: Package } as const);

  // Map variant → icon color so the foreground inside the Badge always
  // contrasts with its background (primary/destructive variants use a
  // filled background, the others render against the surface).
  const iconColor =
    meta.variant === "default"
      ? primaryFg
      : meta.variant === "destructive"
        ? destructiveFg
        : meta.variant === "outline"
          ? mutedFg
          : foreground;

  return { ...meta, color: iconColor };
}

function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const mutedForeground = useThemeColor("mutedForeground");
  const foreground = useThemeColor("foreground");
  const primaryForeground = useThemeColor("primaryForeground");
  const warning = useThemeColor("warning");

  const { data: purchase, isLoading } = usePurchaseDetail(id);

  const conversationQuery = useQuery({
    queryKey: ["purchase", "conversation", purchase?.id],
    enabled:
      !!purchase &&
      !!purchase.buyer_id &&
      !!purchase.seller_id &&
      ["PAID", "SHIPPED", "COMPLETED", "DISPUTED", "REFUNDED"].includes(
        purchase.status ?? "",
      ),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id")
        .eq("listing_id", purchase!.listing_id)
        .eq("buyer_id", purchase!.buyer_id)
        .eq("seller_id", purchase!.seller_id)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
  });

  const conversationLink = useMemo(() => {
    if (conversationQuery.data) return `/inbox/${conversationQuery.data}`;
    if (purchase?.listing?.id) return `/listing/${purchase.listing.id}`;
    return null;
  }, [purchase, conversationQuery.data]);

  // Hooks must run unconditionally, so compute the status config before
  // the early returns even when `purchase` is null. The placeholder is
  // discarded the moment we render the not-found branch.
  const statusConfig = useStatusConfig(purchase?.status ?? "PENDING_PAYMENT");

  if (isLoading) return <PurchaseDetailSkeleton />;

  if (!purchase) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Stack.Screen options={{ headerShown: false }} />
        <MobileHeader title="Commande" fallbackHref="/transactions" />
        <View className="flex-1 items-center justify-center px-6">
          <Receipt size={40} color={mutedForeground} />
          <Text variant="h3" className="mt-4 text-center">
            Commande introuvable
          </Text>
          <Button
            className="mt-6"
            onPress={() => router.replace("/transactions" as never)}
          >
            Mes transactions
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const StatusIcon = statusConfig.Icon;
  const showActions =
    user &&
    conversationQuery.data &&
    ["PAID", "SHIPPED", "COMPLETED", "DISPUTED", "REFUNDED"].includes(
      purchase.status ?? "",
    );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <MobileHeader title="Ma commande" fallbackHref="/transactions" />

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

          {showActions ? (
            <View className="overflow-hidden rounded-2xl border border-border">
              <TransactionActions
                transaction={purchase}
                conversationId={conversationQuery.data!}
                listingId={purchase.listing_id}
                currentUserId={user!.id}
                sellerId={purchase.seller_id}
                buyerId={purchase.buyer_id}
              />
            </View>
          ) : null}

          {purchase.status === "PAID" ? (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onPress={() =>
                router.push(`/orders/${purchase.id}/success` as never)
              }
              leftIcon={<Sparkles size={16} color={warning} />}
            >
              Animation de confirmation
            </Button>
          ) : null}

          <Card className="gap-3">
            <View className="flex-row items-center gap-2">
              <Package size={16} color={foreground} />
              <Text className="text-sm font-semibold">Article</Text>
            </View>
            <View className="flex-row gap-3">
              <View className="h-16 w-16 overflow-hidden rounded-xl bg-muted">
                {purchase.listing?.cover_image_url ? (
                  <Image
                    source={{ uri: purchase.listing.cover_image_url }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                    transition={150}
                  />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Package size={20} color={mutedForeground} />
                  </View>
                )}
              </View>
              <View className="min-w-0 flex-1">
                <Pressable
                  onPress={() => {
                    if (purchase.listing?.id) {
                      router.push(`/listing/${purchase.listing.id}` as never);
                    }
                  }}
                >
                  <Text className="font-semibold" numberOfLines={2}>
                    {purchase.listing?.title ?? purchase.listing_title ?? "—"}
                  </Text>
                </Pressable>
                <View className="mt-1 flex-row flex-wrap gap-1.5">
                  {purchase.listing?.condition ? (
                    <Badge variant="secondary" className="px-2 py-0.5">
                      <Text className="text-[10px] font-medium text-foreground">
                        {CONDITION_LABELS[
                          purchase.listing.condition as CardCondition
                        ] ?? purchase.listing.condition}
                      </Text>
                    </Badge>
                  ) : null}
                </View>
                <Text variant="caption" className="mt-1">
                  Commandée le {formatLongDate(purchase.created_at)}
                </Text>
              </View>
            </View>
          </Card>

          <Card className="gap-3">
            <View className="flex-row items-center gap-2">
              <UserIcon size={16} color={foreground} />
              <Text className="text-sm font-semibold">Vendeur</Text>
            </View>
            <Pressable
              onPress={() => {
                const name = purchase.seller?.username;
                if (name) router.push(`/u/${name}` as never);
              }}
              className="flex-row items-center gap-3 active:opacity-80"
            >
              <Avatar
                uri={purchase.seller?.avatar_url}
                fallback={purchase.seller?.username?.charAt(0) ?? "?"}
                size={40}
              />
              <Text className="text-sm font-medium">
                @{purchase.seller?.username ?? "vendeur"}
              </Text>
              <ChevronRight size={16} color={mutedForeground} />
            </Pressable>
          </Card>

          <Card className="gap-3">
            <View className="flex-row items-center gap-2">
              <ShoppingBag size={16} color={foreground} />
              <Text className="text-sm font-semibold">Paiement</Text>
            </View>
            <View className="gap-2">
              <Row
                label="Montant payé"
                value={formatPrice(purchase.total_amount)}
              />
              {(purchase.shipping_cost ?? 0) > 0 ? (
                <Row
                  label="Frais de port"
                  value={formatPrice(purchase.shipping_cost ?? 0)}
                  mutedValue
                />
              ) : null}
            </View>
          </Card>

          {purchase.tracking_number ? (
            <Card className="gap-3">
              <View className="flex-row items-center gap-2">
                <Truck size={16} color={foreground} />
                <Text className="text-sm font-semibold">Suivi</Text>
              </View>
              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <Hash size={14} color={mutedForeground} />
                  <Text className="font-mono text-sm" selectable>
                    {purchase.tracking_number}
                  </Text>
                </View>
                {purchase.tracking_url ? (
                  <Pressable
                    onPress={() =>
                      Linking.openURL(
                        /^https?:\/\//i.test(purchase.tracking_url!)
                          ? purchase.tracking_url!
                          : `https://${purchase.tracking_url}`,
                      ).catch(() => {})
                    }
                    className="flex-row items-center gap-1.5 self-start rounded-md bg-primary px-3 py-1.5"
                  >
                    <ExternalLink size={12} color={primaryForeground} />
                    <Text className="text-xs font-medium text-primary-foreground">
                      Suivre le colis
                    </Text>
                  </Pressable>
                ) : null}
                {purchase.shipped_at ? (
                  <Text variant="caption">
                    Expédié le {formatLongDate(purchase.shipped_at)}
                  </Text>
                ) : null}
              </View>
            </Card>
          ) : null}

          <View className="gap-3">
            {conversationLink ? (
              <Button
                variant="outline"
                size="lg"
                onPress={() => router.push(conversationLink as never)}
                leftIcon={<MessageCircle size={18} color={foreground} />}
              >
                Messages avec le vendeur
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="lg"
              onPress={() => router.replace("/(tabs)" as never)}
              leftIcon={<Home size={18} color={foreground} />}
            >
              Retour au marché
            </Button>
          </View>
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

function PurchaseDetailSkeleton() {
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <MobileHeader title="Ma commande" fallbackHref="/transactions" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Skeleton className="h-7 w-40 rounded-full" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </ScrollView>
    </View>
  );
}
