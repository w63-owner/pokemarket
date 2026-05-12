import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { formatPrice } from "@pokemarket/shared";
import { Text } from "@/components/ui";

interface ListingContextBarProps {
  listing: {
    id: string;
    title: string;
    cover_image_url: string | null;
    display_price: number;
    status: string;
  };
}

export function ListingContextBar({ listing }: ListingContextBarProps) {
  return (
    <Pressable
      onPress={() => router.push(`/listing/${listing.id}`)}
      className="flex-row items-center gap-2.5 border-b border-border bg-card px-3 py-2 active:bg-muted/50"
    >
      <View className="size-9 overflow-hidden rounded-md border border-border bg-muted">
        {listing.cover_image_url ? (
          <Image
            source={{ uri: listing.cover_image_url }}
            style={{ width: 36, height: 36 }}
            contentFit="cover"
            transition={150}
          />
        ) : null}
      </View>

      <View className="flex-1">
        <Text
          numberOfLines={1}
          className="text-xs font-medium text-foreground"
        >
          {listing.title}
        </Text>
        <Text className="text-xs font-semibold text-primary">
          {formatPrice(listing.display_price)}
        </Text>
      </View>

      <ChevronRight size={16} color="#94a3b8" />
    </Pressable>
  );
}
