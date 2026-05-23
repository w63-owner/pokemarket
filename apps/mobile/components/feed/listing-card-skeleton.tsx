import { View } from "react-native";
import { Skeleton } from "@/components/ui";

export function ListingCardSkeleton() {
  return (
    <View className="flex-1 overflow-hidden rounded-2xl bg-card">
      <Skeleton style={{ aspectRatio: 4 / 5, width: "100%" }} />
      <View className="gap-2 p-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="mt-1 h-5 w-1/2" />
      </View>
    </View>
  );
}
