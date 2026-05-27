import { View, type ViewProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { Text } from "./text";

const badgeVariants = cva("self-start rounded-full px-2.5 py-1", {
  variants: {
    variant: {
      default: "bg-primary",
      secondary: "bg-secondary",
      success: "bg-success/15",
      warning: "bg-warning/15",
      destructive: "bg-destructive/15",
      outline: "border border-border bg-transparent",
      // `ghost` and `link` mirror the web counterparts: no background, no
      // border. `link` additionally drops horizontal padding so it sits
      // inline like a hyperlink instead of a chip.
      ghost: "bg-transparent",
      link: "self-start bg-transparent px-0 py-0",
    },
  },
  defaultVariants: { variant: "default" },
});

const badgeTextVariants = cva("text-xs font-medium", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      success: "text-success",
      warning: "text-warning",
      destructive: "text-destructive",
      outline: "text-foreground",
      ghost: "text-muted-foreground",
      link: "text-primary underline",
    },
  },
  defaultVariants: { variant: "default" },
});

export type BadgeProps = ViewProps &
  VariantProps<typeof badgeVariants> & {
    children: React.ReactNode;
  };

export function Badge({ variant, className, children, ...rest }: BadgeProps) {
  return (
    <View
      className={cn(badgeVariants({ variant }), className as string)}
      {...rest}
    >
      {typeof children === "string" ? (
        <Text className={badgeTextVariants({ variant })}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}
