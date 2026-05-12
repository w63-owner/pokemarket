import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const textVariants = cva("text-foreground", {
  variants: {
    variant: {
      default: "text-base",
      muted: "text-muted-foreground text-sm",
      caption: "text-xs text-muted-foreground",
      h1: "text-3xl font-bold",
      h2: "text-2xl font-bold",
      h3: "text-xl font-semibold",
      h4: "text-lg font-semibold",
      lead: "text-lg",
      large: "text-base font-semibold",
      small: "text-sm",
    },
  },
  defaultVariants: { variant: "default" },
});

export type TextProps = RNTextProps & VariantProps<typeof textVariants>;

export function Text({ className, variant, ...rest }: TextProps) {
  return (
    <RNText className={cn(textVariants({ variant }), className)} {...rest} />
  );
}
