import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { cn } from "@/lib/cn";

export function Progress({
  value,
  className,
}: {
  /** 0..100 */
  value: number;
  className?: string;
}) {
  const fillStyle = useAnimatedStyle(() => ({
    width: withTiming(`${Math.max(0, Math.min(100, value))}%`, {
      duration: 300,
    }),
  }));

  return (
    <View
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <Animated.View
        style={fillStyle}
        className="h-full rounded-full bg-primary"
      />
    </View>
  );
}
