import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { cn } from "@/lib/cn";

type Props = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
};

export function Switch({ checked, onCheckedChange, disabled }: Props) {
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: withTiming(checked ? 22 : 2, { duration: 150 }) },
    ],
  }));

  return (
    <Pressable
      disabled={disabled}
      onPress={() => onCheckedChange(!checked)}
      className={cn(
        "h-7 w-12 justify-center rounded-full px-0.5",
        checked ? "bg-primary" : "bg-muted",
        disabled && "opacity-50",
      )}
    >
      <Animated.View
        style={thumbStyle}
        className="h-6 w-6 rounded-full bg-white shadow"
      />
    </Pressable>
  );
}
