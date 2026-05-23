import { forwardRef, useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  View,
} from "react-native";
import { MotiView } from "moti";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { haptics } from "@/lib/haptics";
import { tapScale } from "@/lib/motion";
import { useThemeColor } from "@/lib/theme-colors";
import { Text } from "./text";

const buttonVariants = cva(
  "flex-row items-center justify-center rounded-xl active:opacity-80",
  {
    variants: {
      variant: {
        default: "bg-primary",
        secondary: "bg-secondary",
        outline: "border border-border bg-background",
        ghost: "bg-transparent",
        destructive: "bg-destructive",
      },
      size: {
        default: "h-12 px-4",
        sm: "h-10 px-3",
        lg: "h-14 px-6",
        icon: "h-12 w-12",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

const buttonTextVariants = cva("font-semibold text-base", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      outline: "text-foreground",
      ghost: "text-foreground",
      destructive: "text-destructive-foreground",
    },
    size: { default: "", sm: "text-sm", lg: "text-lg", icon: "" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export type ButtonVariant = NonNullable<
  VariantProps<typeof buttonVariants>["variant"]
>;

// HIG iOS : feedback tactile au `touch start`, pas au release. On limite
// le haptic aux variants à fort accent visuel (primary / destructive) pour
// éviter le « bourdon » sur les actions secondaires (cancel, segments…).
const HAPTIC_VARIANTS: ReadonlySet<ButtonVariant> = new Set<ButtonVariant>([
  "default",
  "destructive",
]);

export type ButtonProps = Omit<PressableProps, "children"> &
  VariantProps<typeof buttonVariants> & {
    children?: React.ReactNode;
    loading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    /**
     * Disable the implicit `haptics.light()` fired on `onPressIn` for
     * primary/destructive buttons. Useful when the button handler itself
     * triggers a richer haptic (e.g. `haptics.success` after payment).
     */
    disableHaptic?: boolean;
  };

export const Button = forwardRef<View, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    children,
    loading,
    leftIcon,
    rightIcon,
    disabled,
    disableHaptic,
    onPressIn,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const foreground = useThemeColor("foreground");
  const primaryForeground = useThemeColor("primaryForeground");
  const spinnerColor =
    variant === "outline" || variant === "ghost"
      ? foreground
      : primaryForeground;

  const resolvedVariant = (variant ?? "default") as ButtonVariant;
  const shouldHaptic =
    !disableHaptic && !isDisabled && HAPTIC_VARIANTS.has(resolvedVariant);

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      if (shouldHaptic) haptics.light();
      onPressIn?.(event);
    },
    [shouldHaptic, onPressIn],
  );

  return (
    <Pressable
      ref={ref}
      disabled={isDisabled}
      onPressIn={handlePressIn}
      className={cn(
        buttonVariants({ variant, size }),
        isDisabled && "opacity-50",
        className as string,
      )}
      {...rest}
    >
      {({ pressed }) => (
        <MotiView
          animate={tapScale.animate(pressed && !isDisabled)}
          transition={tapScale.transition}
          // The wrapper must not consume the layout — only drive the
          // scale transform so the Pressable's hit-box stays accurate.
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          {loading ? (
            <ActivityIndicator color={spinnerColor} size="small" />
          ) : (
            <>
              {leftIcon ? <View className="mr-2">{leftIcon}</View> : null}
              {typeof children === "string" ? (
                <Text className={buttonTextVariants({ variant, size })}>
                  {children}
                </Text>
              ) : (
                children
              )}
              {rightIcon ? <View className="ml-2">{rightIcon}</View> : null}
            </>
          )}
        </MotiView>
      )}
    </Pressable>
  );
});
