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
  Button,
  Skeleton,
  SmartBackButton,
  Tabs,
  TabsList,
  TabsTrigger,
  Text,
} from "@/components/ui";
import { useThemeColor } from "@/lib/theme-colors";

type TabKey = "purchases" | "sales";

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
  return STATUS_CONFIG[status] ?? { label: status, variant: "outline" as const };
}

export default function TransactionsScreen() {
  const [tab, setTab] = useState<TabKey>("purchases");

  const purchasesQuery = usePurchases({ enabled: true });
  const salesQuery = useSales({ enabled: true });

  const activeQuery = tab === "purchases" ? purchasesQuery : salesQuery;
  const items = useMemo(
    () => activeQuery.data?.pages.flatMap((p) => p.data) ?? [],
    [activeQuery.data],
  );

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await activeQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [activeQuery]);

  const renderItem = useCallback(
    ({ item, index }: { item: TransactionWithDetails; index: number }) => (
      <TransactionRow transaction={item} type={tab} index={index} />
    ),
    [tab],
  );

  const foreground = useThemeColor("foreground");

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-row items-center gap-3 border-b border-border bg-card px-2 py-3">
        <SmartBackButton fallbackHref="/(tabs)/profile" />
        <Text className="text-base font-semibold">Mes transactions</Text>
      </View>

      <View className="px-4 pt-4">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as TabKey)}
        >
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
        </Tabs>
      </View>

      <View className="flex-1 px-4 pt-3">
        {activeQuery.isLoading ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          <EmptyState type={tab} />
        ) : (
          <FlashList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#E63946"
              />
            }
            onEndReached={() => {
              if (activeQuery.hasNextPage && !activeQuery.isFetchingNextPage) {
                activeQuery.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.4}
            ItemSeparatorComponent={() => <View className="h-2" />}
            ListFooterComponent={
              activeQuery.isFetchingNextPage ? (
                <View className="py-4">
                  <ActivityIndicator color="#E63946" />
                </View>
              ) : null
            }
          />
        )}
      </View>
    </SafeAreaView>
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
  const status = getStatusConfig(tx.status ?? "PENDING_PAYMENT");
  const href =
    type === "sales" ? `/profile/sales/${tx.id}` : `/orders/${tx.id}/success`;

  return (
    <MotiView
      from={{ opacity: 0, translateY: 6 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ delay: Math.min(index * 30, 300) }}
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
              <Receipt size={20} color="#94a3b8" />
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
          <ChevronRight size={16} color="#94a3b8" />
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

function EmptyState({ type }: { type: TabKey }) {
  const Icon = type === "purchases" ? ShoppingBag : Store;
  const cta =
    type === "purchases"
      ? { label: "Explorer le marché", href: "/(tabs)" }
      : { label: "Vendre une carte", href: "/(tabs)/sell" };

  return (
    <View className="flex-1 items-center justify-center gap-3 px-6 py-12">
      <View className="rounded-full bg-muted p-4">
        <Icon size={28} color="#64748b" />
      </View>
      <Text variant="h4">
        {type === "purchases"
          ? "Aucun achat pour le moment"
          : "Aucune vente pour le moment"}
      </Text>
      <Text variant="muted" className="text-center">
        {type === "purchases"
          ? "Vos achats apparaîtront ici une fois un paiement effectué."
          : "Vos ventes apparaîtront ici dès qu'un acheteur passera commande."}
      </Text>
      <Button
        className="mt-2"
        onPress={() => router.push(cta.href as never)}
      >
        {cta.label}
      </Button>
    </View>
  );
}
