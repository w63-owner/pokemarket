import { Pressable, View } from "react-native";
import { Link } from "expo-router";
import { ChevronRight } from "lucide-react-native";

import { Avatar, Text } from "@/components/ui";
import { StarRating } from "@/components/shared/star-rating";
import { haptic } from "@/lib/haptics";
import { useThemeColor } from "@/lib/theme-colors";

type Props = {
  username: string;
  avatarUrl?: string | null;
  rating?: number | null;
  reviewCount?: number;
};

/**
 * Seller summary card displayed below the listing CTA. Mirrors the
 * web `SellerBlock` :
 *
 *   - 5-star bar with fractional fills (via shared `<StarRating />`)
 *     when the seller has reviews ;
 *   - "Nouveau vendeur" copy when `rating` is null/0 ;
 *   - Review count appended in parentheses.
 *
 * Wrapped in a Link so tap navigates to the public profile.
 */
export function SellerBlock({
  username,
  avatarUrl,
  rating,
  reviewCount = 0,
}: Props) {
  const mutedForeground = useThemeColor("mutedForeground");

  return (
    <Link href={`/u/${username}`} asChild>
      <Pressable
        onPress={() => haptic("tap")}
        className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3 active:opacity-80"
      >
        <Avatar uri={avatarUrl} fallback={username} size={48} />
        <View className="min-w-0 flex-1">
          <Text className="font-semibold" numberOfLines={1}>
            @{username}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            {rating && rating > 0 ? (
              <>
                <StarRating rating={rating} size="sm" />
                <Text variant="caption">{rating.toFixed(1)}</Text>
                {reviewCount > 0 ? (
                  <Text variant="caption">({reviewCount} avis)</Text>
                ) : null}
              </>
            ) : (
              <Text variant="caption">Nouveau vendeur</Text>
            )}
          </View>
        </View>
        <ChevronRight size={18} color={mutedForeground} />
      </Pressable>
    </Link>
  );
}
