import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { MotiView } from "moti";
import { ChevronRight, Receipt, ShoppingBag, Store } from "lucide-react-native";
import {
  formatPrice,
  formatRelativeDate,
  type TransactionWithDetails,
} from "@pokemarket/shared";

import { usePurchases, useSales } from "@/hooks/use-transactions";
import {
  Badge,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from "@/components/ui";
import { MobileHeader } from "@/components/layout/mobile-header";
import { EmptyState, ErrorState } from "@/components/shared";
import { fadeInUp, staggerDelay } from "@/lib/motion";
import { useThemeColor } from "@/lib/theme-colors";

type TabKey = "purchases" | "sales";

type TransactionsInfiniteQuery = ReturnType<typeof usePurchases>;

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline" | "warning";
  }
> = {
  PENDING_PAYMENT: { label: "En attente de paiement", variant: "outline" },
  PAID: { label: "Payée", variant: "default" },
  SHIPPED: { label: "Expédiée", variant: "secondary" },
  COMPLETED: { label: "Finalisée", variant: "default" },
  CANCELLED: { label: "Annulée", variant: "destructive" },
  EXPIRED: { label: "Expirée", variant: "destructive" },
  REFUNDED: { label: "Remboursée", variant: "outline" },
  DISPUTED: { label: "Litige", variant: "destructive" },
};

function getStatusConfig(status: string) {
  return (
    STATUS_CONFIG[status] ?? { label: status, variant: "outline" as const }
  );
}

export default function TransactionsScreen() {
  const [tab, setTab] = useState<TabKey>("purchases");

  const purchasesQuery = usePurchases({ enabled: true });
  const salesQuery = useSales({ enabled: true });

  const foreground = useThemeColor("foreground");

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <MobileHeader title="Mes transactions" fallbackHref="/(tabs)/profile" />

      <SafeAreaView edges={["bottom"]} className="flex-1">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as TabKey)}
          variant="line"
          swipeable
          fill
        >
          <View className="bg-background px-4 pt-4">
            <TabsList>
              <TabsTrigger value="purchases">
                <View className="flex-row items-center gap-1.5">
                  <ShoppingBag size={14} color={foreground} />
                  <Text className="text-sm font-medium">Mes achats</Text>
                </View>
              </TabsTrigger>
              <TabsTrigger value="sales">
                <View className="flex-row items-center gap-1.5">
                  <Store size={14} color={foreground} />
                  <Text className="text-sm font-medium">Mes ventes</Text>
                </View>
              </TabsTrigger>
            </TabsList>
          </View>

          <TabsContent value="purchases">
            <TransactionsPanel query={purchasesQuery} type="purchases" />
          </TabsContent>

          <TabsContent value="sales">
            <TransactionsPanel query={salesQuery} type="sales" />
          </TabsContent>
        </Tabs>
      </SafeAreaView>
    </View>
  );
}

function TransactionsPanel({
  query,
  type,
}: {
  query: TransactionsInfiniteQuery;
  type: TabKey;
}) {
  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.data) ?? [],
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
    ({ item, index }: { item: TransactionWithDetails; index: number }) => (
      <TransactionRow transaction={item} type={type} index={index} />
    ),
    [type],
  );

  const muted = useThemeColor("mutedForeground");
  const primary = useThemeColor("primary");

  if (query.isLoading) {
    return (
      <View className="flex-1 px-4 pt-3">
        <ListSkeleton />
      </View>
    );
  }

  if (query.isError) {
    return (
      <View className="flex-1 px-4 pt-3">
        <ErrorState
          variant="card"
          title="Impossible de charger les transactions"
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
    );
  }

  if (items.length === 0) {
    return (
      <View className="flex-1 px-4 pt-3">
        <EmptyState
          icon={
            type === "purchases" ? (
              <ShoppingBag size={28} color={muted} />
            ) : (
              <Store size={28} color={muted} />
            )
          }
          title={
            type === "purchases"
              ? "Aucun achat pour le moment"
              : "Aucune vente pour le moment"
          }
          description={
            type === "purchases"
              ? "Vos achats apparaîtront ici une fois un paiement effectué."
              : "Vos ventes apparaîtront ici dès qu'un acheteur passera commande."
          }
          action={
            type === "purchases"
              ? {
                  label: "Explorer le marché",
                  onPress: () => router.push("/(tabs)" as never),
                }
              : {
                  label: "Vendre une carte",
                  onPress: () => router.push("/(tabs)/sell" as never),
                }
          }
        />
      </View>
    );
  }

  return (
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
  );
}

function TransactionRow({
  transaction: tx,
  type,
  index,
}: {
  transaction: TransactionWithDetails;
  type: TabKey;
  index: number;
}) {
  const mutedForeground = useThemeColor("mutedForeground");
  const status = getStatusConfig(tx.status ?? "PENDING_PAYMENT");
  // Sales keep their existing dedicated screen (with shipping CTAs etc.);
  // purchases route to the generic order detail page so non-PAID statuses
  // (PENDING_PAYMENT, SHIPPED, COMPLETED, CANCELLED, …) get a real screen
  // instead of crashing the success-only one.
  const href =
    type === "sales" ? `/profile/sales/${tx.id}` : `/orders/${tx.id}`;

  return (
    <MotiView
      from={fadeInUp.from}
      animate={fadeInUp.animate}
      transition={{
        ...(fadeInUp.transition as object),
        delay: staggerDelay(index, 30, 10),
      }}
    >
      <Pressable
        onPress={() => router.push(href as never)}
        className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3 active:bg-muted"
      >
        <View className="h-14 w-14 overflow-hidden rounded-xl bg-muted">
          {tx.listing?.cover_image_url ? (
            <Image
              source={{ uri: tx.listing.cover_image_url }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <Receipt size={20} color={mutedForeground} />
            </View>
          )}
        </View>

        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium" numberOfLines={1}>
            {tx.listing?.title ?? tx.listing_title ?? "Transaction"}
          </Text>
          <View className="mt-1 flex-row items-center gap-2">
            <Badge variant={status.variant} className="px-2 py-0.5">
              <Text className="text-[10px] font-medium text-foreground">
                {status.label}
              </Text>
            </Badge>
            <Text variant="caption" className="text-[11px]">
              {tx.created_at ? formatRelativeDate(tx.created_at) : ""}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-1.5">
          <Text className="text-sm font-semibold">
            {formatPrice(tx.total_amount)}
          </Text>
          <ChevronRight size={16} color={mutedForeground} />
        </View>
      </Pressable>
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
