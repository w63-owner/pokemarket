import { memo } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { Heart } from "lucide-react-native";
import { MotiView } from "moti";
import type { FeedItem } from "@pokemarket/shared";
import { formatPrice } from "@pokemarket/shared";
import { Badge, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

type Props = {
  item: FeedItem;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
};

function ListingCardComponent({ item, isFavorite, onToggleFavorite }: Props) {
  return (
    <Link href={`/listing/${item.id}`} asChild>
      <Pressable className="flex-1">
        {({ pressed }) => (
          <MotiView
            animate={{ scale: pressed ? 0.97 : 1 }}
            transition={{ type: "timing", duration: 120 }}
            className="overflow-hidden rounded-2xl bg-card"
          >
            <View className="relative">
              <Image
                source={{ uri: item.cover_image_url }}
                style={{ aspectRatio: 0.72, width: "100%" }}
                contentFit="cover"
                transition={150}
              />
              {item.is_graded && item.grade_note ? (
                <Badge
                  variant="secondary"
                  className="absolute left-2 top-2"
                >
                  {`Gradée ${item.grade_note}`}
                </Badge>
              ) : null}
              {onToggleFavorite ? (
                <Pressable
                  onPress={() => onToggleFavorite(item.id)}
                  hitSlop={8}
                  className="absolute right-2 top-2 h-9 w-9 items-center justify-center rounded-full bg-white/90"
                >
                  <Heart
                    size={18}
                    color="#E63946"
                    fill={isFavorite ? "#E63946" : "transparent"}
                  />
                </Pressable>
              ) : null}
            </View>
            <View className="p-3">
              <Text
                className={cn("text-sm font-medium")}
                numberOfLines={2}
              >
                {item.title}
              </Text>
              <Text className="mt-1 text-base font-bold text-primary">
                {formatPrice(item.display_price)}
              </Text>
            </View>
          </MotiView>
        )}
      </Pressable>
    </Link>
  );
}

export const ListingCard = memo(ListingCardComponent);
