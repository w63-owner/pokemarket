import { Pressable, RefreshControl, View } from "react-native";
import { router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { Plus, Tag } from "lucide-react-native";
import { useMyListings } from "@/hooks/use-listings";
import { MyListingRow } from "@/components/profile/my-listing-row";
import { EmptyState } from "@/components/shared";
import { Skeleton } from "@/components/ui";
import { MobileHeader } from "@/components/layout/mobile-header";
import { useThemeColor } from "@/lib/theme-colors";

export default function MyListingsScreen() {
  const {
    data: listings = [],
    isLoading,
    refetch,
    isRefetching,
  } = useMyListings();

  const muted = useThemeColor("mutedForeground");

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <MobileHeader
        title="Mes annonces"
        fallbackHref="/(tabs)/profile"
        rightAction={
          <Pressable
            onPress={() => router.push("/(tabs)/sell")}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-primary"
            accessibilityRole="button"
            accessibilityLabel="Vendre une carte"
          >
            <Plus size={20} color="#fff" />
          </Pressable>
        }
      />

      <SafeAreaView edges={["bottom"]} className="flex-1">
        {isLoading ? (
          <View className="gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </View>
        ) : listings.length === 0 ? (
          <EmptyState
            icon={<Tag size={28} color={muted} />}
            title="Aucune annonce publiée"
            description="Vos annonces apparaîtront ici une fois que vous aurez mis une carte en vente."
            action={{
              label: "Vendre une carte",
              onPress: () => router.push("/(tabs)/sell"),
            }}
          />
        ) : (
          <FlashList
            data={listings}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <MyListingRow listing={item} index={index} />
            )}
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            ItemSeparatorComponent={() => <View className="h-2" />}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor="#E63946"
              />
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}
