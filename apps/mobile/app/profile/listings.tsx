import { Pressable, RefreshControl, View } from "react-native";
import { router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { Plus, Tag } from "lucide-react-native";
import { useMyListings } from "@/hooks/use-listings";
import { MyListingRow } from "@/components/profile/my-listing-row";
import { EmptyState } from "@/components/shared";
import { Skeleton, SmartBackButton, Text } from "@/components/ui";
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
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center justify-between border-b border-border bg-card px-2 py-3">
        <View className="flex-row items-center gap-3">
          <SmartBackButton fallbackHref="/(tabs)/profile" />
          <Text className="text-base font-semibold">Mes annonces</Text>
        </View>
        <Pressable
          onPress={() => router.push("/(tabs)/sell")}
          hitSlop={8}
          className="mr-2 h-10 w-10 items-center justify-center rounded-full bg-primary"
        >
          <Plus size={20} color="#fff" />
        </Pressable>
      </View>

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
  );
}
