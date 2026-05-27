import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { Heart } from "lucide-react-native";
import type { FeedItem } from "@pokemarket/shared";
import { formatPrice } from "@pokemarket/shared";
import { Badge, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { spring, useReducedMotionSafe } from "@/lib/motion";
import { useThemeColor } from "@/lib/theme-colors";

// Neutral 4-pixel BlurHash; renders a soft beige rectangle behind the
// image while it decodes. Will be replaced per-listing once `listings`
// gets a `image_blurhash` column (cf. audit §5.1) ; until then the
// static fallback removes the harsh "pop-in" we had with no placeholder.
const FALLBACK_BLURHASH = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";

type Props = {
  item: FeedItem;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
};

function ListingCardComponent({ item, isFavorite, onToggleFavorite }: Props) {
  const primary = useThemeColor("primary");

  const blurhash = (item as { image_blurhash?: string | null }).image_blurhash;
  const placeholder = blurhash ?? FALLBACK_BLURHASH;
  const rarity = item.card_rarity;
  const language = item.card_language;
  const showConditionPill = !item.is_graded && !!item.condition;

  return (
    <Link href={`/listing/${item.id}`} asChild>
      <Pressable
        className="flex-1"
        style={({ pressed }) => ({
          transform: [{ scale: pressed ? 0.97 : 1 }],
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <View className="overflow-hidden rounded-2xl bg-card">
          <View className="relative">
            <Image
              source={{ uri: item.cover_image_url }}
              style={{ aspectRatio: 4 / 5, width: "100%" }}
              contentFit="cover"
              transition={250}
              placeholder={{ blurhash: placeholder }}
              placeholderContentFit="cover"
            />
            {item.is_graded && item.grade_note ? (
              <Badge variant="secondary" className="absolute left-2 top-2">
                {`Gradée ${item.grade_note}`}
              </Badge>
            ) : null}
            {onToggleFavorite ? (
              <HeartButton
                isFavorite={!!isFavorite}
                primary={primary}
                onPress={() => onToggleFavorite(item.id)}
              />
            ) : null}
          </View>
          <View className="gap-1 p-3">
            <Text className={cn("text-sm font-medium")} numberOfLines={2}>
              {item.title}
            </Text>
            {item.card_series ? (
              <Text variant="caption" numberOfLines={1}>
                {item.card_series}
                {item.card_number ? ` · N°${item.card_number}` : ""}
              </Text>
            ) : null}
            {showConditionPill || rarity || language ? (
              <View className="mt-0.5 flex-row flex-wrap items-center gap-1">
                {showConditionPill ? (
                  <View className="rounded-full bg-secondary px-2 py-0.5">
                    <Text className="text-[10px] font-medium text-secondary-foreground">
                      {item.condition}
                    </Text>
                  </View>
                ) : null}
                {rarity ? (
                  <View className="rounded-full bg-warning/15 px-2 py-0.5">
                    <Text className="text-[10px] font-medium text-warning">
                      {rarity}
                    </Text>
                  </View>
                ) : null}
                {language ? (
                  <View className="rounded-full bg-brand-secondary/15 px-2 py-0.5">
                    <Text className="text-[10px] font-medium text-brand-secondary">
                      {language.toUpperCase()}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <Text className="mt-1 text-base font-bold text-primary">
              {formatPrice(item.display_price)}
            </Text>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

export const ListingCard = memo(ListingCardComponent);

type HeartButtonProps = {
  isFavorite: boolean;
  primary: string;
  onPress: () => void;
};

/**
 * Favorite toggle with a subtle "wobble" — Reanimated spring sequence
 * driven by a shared value so the animation runs entirely on the UI
 * thread and is reduced-motion-aware.
 */
function HeartButton({ isFavorite, primary, onPress }: HeartButtonProps) {
  const reduceMotion = useReducedMotionSafe();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    haptic("tap");
    if (!reduceMotion) {
      scale.value = withSequence(
        withSpring(1.25, spring.bouncy),
        withSpring(1, spring.gentle),
      );
    }
    onPress();
  }, [onPress, reduceMotion, scale]);

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      className="absolute right-2 top-2 h-9 w-9 items-center justify-center rounded-full bg-white/90"
      accessibilityRole="button"
      accessibilityLabel={
        isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"
      }
    >
      <Animated.View style={animatedStyle}>
        <Heart
          size={18}
          color={primary}
          fill={isFavorite ? primary : "transparent"}
        />
      </Animated.View>
    </Pressable>
  );
}
