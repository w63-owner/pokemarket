import { useCallback, useEffect } from "react";
import {
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { cn } from "@/lib/cn";
import { useEffectiveTheme } from "@/lib/stores/theme";
import { useReducedMotionSafe } from "@/lib/motion";

export type SkeletonVariant = "rectangular" | "circular" | "text";

export type SkeletonProps = ViewProps & {
  variant?: SkeletonVariant;
  /**
   * Disable the shimmer overlay (fallback to the static muted block).
   * Mirrors what `useReducedMotionSafe` already does — exposed as a prop
   * so callers can force the static state, e.g. inside very long lists
   * where the gradient overdraw cost would dominate the frame budget.
   */
  noShimmer?: boolean;
};

const VARIANT_RADIUS: Record<SkeletonVariant, string> = {
  rectangular: "rounded-md",
  circular: "rounded-full",
  // `rounded` (4px) reads as a typography pill — slightly tighter than
  // the rectangular default.
  text: "rounded",
};

// 1.5 s round-trip is the iOS-native sweet spot — fast enough to read as
// active loading, slow enough to feel ambient (vs. the 800 ms
// `duration.dramatic` preset used by one-shot foreground transitions).
const SHIMMER_LOOP_MS = 1500;

// Highlight band colours tuned per scheme so the sweep stays visible on
// both light (`bg-muted: #f8f9fa`) and dark (`bg-muted: #2a2a3e`) without
// blowing out either background.
const HIGHLIGHT: Record<"light" | "dark", string> = {
  light: "rgba(255, 255, 255, 0.6)",
  dark: "rgba(255, 255, 255, 0.08)",
};

const TRANSPARENT = "rgba(255, 255, 255, 0)";

export function Skeleton({
  className,
  style,
  variant = "rectangular",
  noShimmer,
  onLayout,
  ...rest
}: SkeletonProps) {
  const reduceMotion = useReducedMotionSafe();
  const scheme = useEffectiveTheme();
  const progress = useSharedValue(0);
  const width = useSharedValue(0);

  const shimmerEnabled = !reduceMotion && !noShimmer;

  useEffect(() => {
    if (!shimmerEnabled) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, {
        duration: SHIMMER_LOOP_MS,
        // Linear easing keeps the sweep constant-speed — any easing
        // accelerates/decelerates the band which reads as a glitch.
        easing: Easing.linear,
      }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(progress);
    };
  }, [shimmerEnabled, progress]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      width.value = event.nativeEvent.layout.width;
      onLayout?.(event);
    },
    [width, onLayout],
  );

  const shimmerStyle = useAnimatedStyle(() => {
    const w = width.value;
    // The band is 60 % of the container (min 40 px so very thin pills
    // still get a visible highlight). It slides from `-bandWidth` to `w`
    // so it enters and leaves the visible area cleanly.
    const bandWidth = Math.max(w * 0.6, 40);
    const translateX = interpolate(progress.value, [0, 1], [-bandWidth, w]);
    return {
      width: bandWidth,
      transform: [{ translateX }],
    };
  });

  const variantClass = VARIANT_RADIUS[variant];
  const sizingClass = variant === "text" ? "h-4" : "";

  return (
    <View
      onLayout={handleLayout}
      style={style}
      className={cn(
        "overflow-hidden bg-muted",
        variantClass,
        sizingClass,
        className as string,
      )}
      {...rest}
    >
      {shimmerEnabled ? (
        <Animated.View
          pointerEvents="none"
          style={[ABSOLUTE_FILL_VERTICAL, shimmerStyle]}
        >
          <LinearGradient
            colors={[TRANSPARENT, HIGHLIGHT[scheme], TRANSPARENT]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const ABSOLUTE_FILL_VERTICAL: StyleProp<ViewStyle> = {
  position: "absolute",
  top: 0,
  bottom: 0,
  left: 0,
};

export function SkeletonText({
  lines = 1,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <View className={cn("flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} variant="text" className="w-full" />
      ))}
    </View>
  );
}
