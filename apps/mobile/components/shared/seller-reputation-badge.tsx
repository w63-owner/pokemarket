import { View } from "react-native";
import { Star } from "lucide-react-native";
import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { StarRating } from "./star-rating";
import { useThemeColor } from "@/lib/theme-colors";

type Props = {
  avgRating: number;
  reviewCount: number;
  className?: string;
};

export function SellerReputationBadge({
  avgRating,
  reviewCount,
  className,
}: Props) {
  const muted = useThemeColor("mutedForeground");

  if (reviewCount === 0) {
    return (
      <View
        className={cn(
          "flex-row items-center gap-2 rounded-xl bg-muted/60 px-3 py-2",
          className,
        )}
      >
        <Star size={16} color={muted} />
        <Text variant="muted" className="text-sm">
          Nouveau vendeur — pas encore d&apos;avis
        </Text>
      </View>
    );
  }

  return (
    <View
      className={cn(
        "flex-row items-center gap-3 rounded-xl bg-muted/60 px-3 py-2",
        className,
      )}
    >
      <StarRating rating={avgRating} size="sm" />
      <Text className="text-sm font-semibold tabular-nums">
        {avgRating.toFixed(1)}
      </Text>
      <Text variant="muted" className="text-sm">
        ({reviewCount} avis)
      </Text>
    </View>
  );
}
