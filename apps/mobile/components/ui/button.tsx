import { forwardRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  View,
} from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
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

export type ButtonProps = Omit<PressableProps, "children"> &
  VariantProps<typeof buttonVariants> & {
    children?: React.ReactNode;
    loading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
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
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      ref={ref}
      disabled={isDisabled}
      className={cn(
        buttonVariants({ variant, size }),
        isDisabled && "opacity-50",
        className as string,
      )}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "outline" || variant === "ghost" ? "#0f172a" : "#fff"}
          size="small"
        />
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
    </Pressable>
  );
});
