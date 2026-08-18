import { forwardRef, useCallback } from "react";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
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
import { useIsInsideSheet } from "./sheet";

export type TextareaProps = TextInputProps & {
  error?: boolean;
  /** Override automatic bottom-sheet input detection when necessary. */
  withinSheet?: boolean;
};

const FOCUS_DURATION = duration.fast;

export const Textarea = forwardRef<TextInput, TextareaProps>(function Textarea(
  {
    className,
    error,
    withinSheet,
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
  const isInsideSheet = useIsInsideSheet();
  const useBottomSheetInput = withinSheet ?? isInsideSheet;

  const setBottomSheetRef = useCallback(
    (instance: TextInput | null | undefined) => {
      const normalizedInstance = instance ?? null;
      if (typeof ref === "function") {
        ref(normalizedInstance);
      } else if (ref) {
        ref.current = normalizedInstance;
      }
    },
    [ref],
  );

  // Derive the focus/blur handler types from RN's own `TextInputProps`
  // so we stay forward-compatible with the 0.81 `FocusEvent` / `BlurEvent`
  // shapes (RN deprecated the `NativeSyntheticEvent<TextInputFocusEventData>`
  // overload).
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
      className="min-h-24 rounded-xl border border-border bg-background"
    >
      {useBottomSheetInput ? (
        <BottomSheetTextInput
          ref={setBottomSheetRef}
          multiline
          textAlignVertical="top"
          editable={editable}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholderTextColor={placeholderTextColor ?? palette.mutedForeground}
          className={cn(
            "flex-1 p-4 text-base text-foreground",
            editable === false && "opacity-60",
            className as string,
          )}
          {...rest}
        />
      ) : (
        <TextInput
          ref={ref}
          multiline
          textAlignVertical="top"
          editable={editable}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholderTextColor={placeholderTextColor ?? palette.mutedForeground}
          className={cn(
            "flex-1 p-4 text-base text-foreground",
            editable === false && "opacity-60",
            className as string,
          )}
          {...rest}
        />
      )}
    </Animated.View>
  );
});
