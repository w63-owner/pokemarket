import { forwardRef, useCallback } from "react";
import { TextInput, type TextInputProps } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { cn } from "@/lib/cn";
import { duration } from "@/lib/motion";
import { useThemeColors } from "@/lib/theme-colors";

export type InputProps = TextInputProps & {
  error?: boolean;
};

// `duration.fast` is expressed in milliseconds by the mobile motion module
// (vs. seconds on web) — Reanimated `withTiming` takes ms natively.
const FOCUS_DURATION = duration.fast;

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    className,
    error,
    placeholderTextColor,
    onFocus,
    onBlur,
    editable,
    ...rest
  },
  ref,
) {
  const palette = useThemeColors();
  const focus = useSharedValue(0);

  // Use `Parameters<NonNullable<...>>` to defer to RN's own (0.81 +) typing
  // for `onFocus` / `onBlur` — the canonical `FocusEvent` / `BlurEvent`
  // shapes diverge from the legacy `NativeSyntheticEvent<TextInputFocusEventData>`,
  // so deriving from the prop type keeps us forward-compatible.
  type FocusHandler = NonNullable<TextInputProps["onFocus"]>;
  type BlurHandler = NonNullable<TextInputProps["onBlur"]>;

  const handleFocus = useCallback<FocusHandler>(
    (event) => {
      focus.value = withTiming(1, {
        duration: FOCUS_DURATION,
        easing: Easing.out(Easing.cubic),
      });
      onFocus?.(event);
    },
    [focus, onFocus],
  );

  const handleBlur = useCallback<BlurHandler>(
    (event) => {
      focus.value = withTiming(0, {
        duration: FOCUS_DURATION,
        easing: Easing.in(Easing.cubic),
      });
      onBlur?.(event);
    },
    [focus, onBlur],
  );

  // When `error` is set the border stays destructive in both states so the
  // animated interpolation collapses to a single colour. Otherwise it
  // crossfades between the resting `border` and the focused `ring`.
  const restingColor = error ? palette.destructive : palette.border;
  const activeColor = error ? palette.destructive : palette.ring;

  const animatedStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focus.value,
      [0, 1],
      [restingColor, activeColor],
    ),
  }));

  return (
    <Animated.View
      style={animatedStyle}
      className="h-12 flex-row items-center rounded-xl border border-border bg-background"
    >
      <TextInput
        ref={ref}
        editable={editable}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholderTextColor={placeholderTextColor ?? palette.mutedForeground}
        className={cn(
          "flex-1 px-4 text-base text-foreground",
          editable === false && "opacity-60",
          className as string,
        )}
        {...rest}
      />
    </Animated.View>
  );
});
