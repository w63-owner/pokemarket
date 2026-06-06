import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, View } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { MotiView } from "moti";
import {
  AlertCircle,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react-native";
import {
  formatPrice,
  formatRelativeDate,
  type Payout,
  type PayoutStatus,
} from "@pokemarket/shared";

import { usePayoutHistory } from "@/hooks/use-wallet";
import { Badge, Skeleton, Text } from "@/components/ui";
import { MobileHeader } from "@/components/layout/mobile-header";
import { EmptyState, ErrorState } from "@/components/shared";
import { fadeInUp, staggerDelay } from "@/lib/motion";
import { useThemeColor, useThemeColors } from "@/lib/theme-colors";

type StatusVariant = "default" | "secondary" | "destructive" | "outline";

type StatusConfigEntry = {
  label: string;
  variant: StatusVariant;
  Icon: React.ComponentType<{ size: number; color: string }>;
};

const STATUS_CONFIG: Record<PayoutStatus, StatusConfigEntry> = {
  pending: {
    label: "En attente",
    variant: "outline",
    Icon: Clock,
  },
  in_transit: {
    label: "En cours",
    variant: "secondary",
    Icon: ArrowUpRight,
  },
  paid: {
    label: "Reçu",
    variant: "default",
    Icon: CheckCircle2,
  },
  failed: {
    label: "Échoué",
    variant: "destructive",
    Icon: AlertCircle,
  },
  canceled: {
    label: "Annulé",
    variant: "outline",
    Icon: XCircle,
  },
};

export default function PayoutsHistoryScreen() {
  const query = usePayoutHistory();
  const colors = useThemeColors();
  const primary = useThemeColor("primary");

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.payouts) ?? [],
    [query.data],
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [query]);

  const renderItem = useCallback(
    ({ item, index }: { item: Payout; index: number }) => (
      <PayoutRow payout={item} index={index} />
    ),
    [],
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <MobileHeader title="Historique des virements" fallbackHref="/wallet" />

      <SafeAreaView edges={["bottom"]} className="flex-1">
        {query.isLoading ? (
          <View className="flex-1 px-4 pt-3">
            <ListSkeleton />
          </View>
        ) : query.isError ? (
          <View className="flex-1 px-4 pt-3">
            <ErrorState
              variant="card"
              title="Impossible de charger l'historique"
              description={
                query.error instanceof Error
                  ? query.error.message
                  : "Réessayez dans un instant."
              }
              action={{
                label: "Réessayer",
                onPress: () => void query.refetch(),
              }}
            />
          </View>
        ) : items.length === 0 ? (
          <View className="flex-1 px-4 pt-3">
            <EmptyState
              icon={<Banknote size={28} color={colors.mutedForeground} />}
              title="Aucun virement effectué"
              description="Vos virements apparaîtront ici une fois que vous aurez demandé un retrait de votre solde disponible."
            />
          </View>
        ) : (
          <FlashList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 24,
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={primary}
              />
            }
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) {
                query.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.4}
            ItemSeparatorComponent={() => <View className="h-2" />}
            ListFooterComponent={
              query.isFetchingNextPage ? (
                <View className="py-4">
                  <ActivityIndicator color={primary} />
                </View>
              ) : null
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

function PayoutRow({ payout, index }: { payout: Payout; index: number }) {
  const colors = useThemeColors();
  const config = STATUS_CONFIG[payout.status];
  const Icon = config.Icon;

  const iconBgColor =
    payout.status === "paid"
      ? "bg-success/20"
      : payout.status === "failed"
        ? "bg-destructive/20"
        : "bg-muted";

  const iconColor =
    payout.status === "paid"
      ? colors.success
      : payout.status === "failed"
        ? colors.destructive
        : colors.mutedForeground;

  const amountColor =
    payout.status === "paid"
      ? "text-success"
      : payout.status === "failed"
        ? "text-destructive"
        : "text-foreground";

  return (
    <MotiView
      from={fadeInUp.from}
      animate={fadeInUp.animate}
      transition={{
        ...(fadeInUp.transition as object),
        delay: staggerDelay(index, 30, 10),
      }}
    >
      <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <View
          className={`h-10 w-10 items-center justify-center rounded-full ${iconBgColor}`}
        >
          <Icon size={20} color={iconColor} />
        </View>

        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-medium">Virement bancaire</Text>
            <Badge variant={config.variant} className="px-2 py-0.5">
              <Text className="text-[10px] font-medium">{config.label}</Text>
            </Badge>
          </View>
          <Text variant="caption" className="mt-0.5 text-xs">
            {formatRelativeDate(payout.requested_at)}
          </Text>
          {payout.status === "failed" && payout.failure_message && (
            <Text className="mt-1 text-xs text-destructive">
              {payout.failure_message}
            </Text>
          )}
        </View>

        <View className="items-end">
          <Text className={`text-lg font-semibold ${amountColor}`}>
            {formatPrice(payout.amount)}
          </Text>
          {payout.completed_at && (
            <Text variant="caption" className="text-[10px]">
              {payout.status === "paid" ? "Reçu " : ""}
              {formatRelativeDate(payout.completed_at)}
            </Text>
          )}
        </View>
      </View>
    </MotiView>
  );
}

function ListSkeleton() {
  return (
    <View className="gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-2xl" />
      ))}
    </View>
  );
}
