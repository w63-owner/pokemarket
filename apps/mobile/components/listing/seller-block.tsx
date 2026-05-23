import { Pressable, View } from "react-native";
import { Link } from "expo-router";
import { ChevronRight, Star } from "lucide-react-native";
import { Avatar, Text } from "@/components/ui";

type Props = {
  username: string;
  avatarUrl?: string | null;
  rating?: number | null;
  reviewCount?: number;
};

export function SellerBlock({
  username,
  avatarUrl,
  rating,
  reviewCount = 0,
}: Props) {
  return (
    <Link href={`/u/${username}`} asChild>
      <Pressable className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3 active:opacity-80">
        <Avatar uri={avatarUrl} fallback={username} size={48} />
        <View className="flex-1">
          <Text className="font-semibold">@{username}</Text>
          {rating ? (
            <View className="mt-0.5 flex-row items-center gap-1">
              <Star size={12} color="#f59e0b" fill="#f59e0b" />
              <Text variant="caption">
                {rating.toFixed(1)} ({reviewCount} avis)
              </Text>
            </View>
          ) : (
            <Text variant="caption">Aucun avis</Text>
          )}
        </View>
        <ChevronRight size={18} color="#94a3b8" />
      </Pressable>
    </Link>
  );
}
