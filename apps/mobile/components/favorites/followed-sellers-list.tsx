import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { MotiView } from "moti";
import { Users } from "lucide-react-native";
import { countryCodeToFlag, regionDisplayName } from "@pokemarket/shared";

import { useFollowedSellers } from "@/hooks/use-followed-sellers";
import { EmptyState } from "@/components/shared";
import { Avatar, Text } from "@/components/ui";
import { FollowButton } from "@/components/profile/follow-button";
import { fadeInUp, staggerDelay } from "@/lib/motion";
import { useThemeColor } from "@/lib/theme-colors";
import type { FavoriteSellerRow } from "@/lib/api/favorites";

export function FollowedSellersList() {
  const primary = useThemeColor("primary");
  const { data: sellers = [], isLoading, isError } = useFollowedSellers();

  if (isLoading && sellers.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-16">
        <Text variant="muted">Chargement…</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center px-6 py-16">
        <Text variant="muted" className="mb-4 text-center">
          Impossible de charger les vendeurs suivis.
        </Text>
      </View>
    );
  }

  if (sellers.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-4 py-12">
        <EmptyState
          icon={<Users size={28} color={primary} />}
          title="Aucun vendeur suivi"
          description="Quand tu suis un vendeur depuis son profil public, il apparaît ici pour retrouver ses futures cartes plus vite."
        />
      </View>
    );
  }

  return (
    <View className="flex-1 px-4 pt-4">
      <View className="gap-3 pb-8">
        {sellers.map((row, index) => (
          <SellerRow key={row.seller_id} row={row} index={index} />
        ))}
      </View>
    </View>
  );
}

function SellerRow({ row, index }: { row: FavoriteSellerRow; index: number }) {
  const cc = row.profiles.country_code;
  const flag = cc ? countryCodeToFlag(cc) : "";
  const region = cc ? regionDisplayName(cc, "fr") : "";

  return (
    <MotiView
      from={fadeInUp.from}
      animate={fadeInUp.animate}
      transition={{
        ...(fadeInUp.transition as object),
        delay: staggerDelay(index, 45, 10),
      }}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3"
    >
      <Avatar
        uri={row.profiles.avatar_url}
        fallback={row.profiles.username?.charAt(0) ?? "?"}
        size={48}
      />
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-base font-semibold" numberOfLines={1}>
          @{row.profiles.username}
        </Text>
        {region ? (
          <Text variant="muted" className="text-xs" numberOfLines={1}>
            {flag} {region}
          </Text>
        ) : null}
      </View>
      <View className="flex-shrink-0 items-end gap-2">
        <FollowButton sellerId={row.seller_id} compact />
        <Pressable
          onPress={() => router.push(`/u/${row.profiles.username}` as never)}
          hitSlop={8}
        >
          <Text variant="caption" className="text-[11px] text-primary">
            Voir le profil
          </Text>
        </Pressable>
      </View>
    </MotiView>
  );
}
