import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { cn } from "@/lib/cn";
import { haptics } from "@/lib/haptics";
import { spring } from "@/lib/motion";

type Props = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
};

// Reanimated rejects the Moti `{ type: "spring", ... }` shape — strip the
// tag and reuse the spring.snappy numeric values verbatim so the toggle
// feel stays iso with the rest of the motion system.
const TOGGLE_SPRING = {
  stiffness: spring.snappy.stiffness,
  damping: spring.snappy.damping,
  mass: spring.snappy.mass,
};

export function Switch({ checked, onCheckedChange, disabled }: Props) {
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(checked ? 22 : 2, TOGGLE_SPRING) }],
  }));

  const handlePress = () => {
    // Mirror the audio-haptic Apple plays on a UISwitch toggle. `disabled`
    // short-circuits via the `Pressable disabled` prop so we never reach
    // here when the switch is inert.
    haptics.selection();
    onCheckedChange(!checked);
  };

  return (
    <Pressable
      disabled={disabled}
      onPress={handlePress}
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
