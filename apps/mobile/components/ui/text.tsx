import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/*
 * Typography ramp — `font-heading` maps to Plus Jakarta Sans (700) and
 * `font-sans` to Inter via `tailwind.config.js#fontFamily`. Headings
 * use `font-heading` to match the web `<h1>`–`<h4>` which inherit
 * `--font-heading: var(--font-jakarta)`.
 *
 * NativeWind has no concept of "weight in family" — each weight is its
 * own font face — so the explicit weight utility (`font-bold`,
 * `font-semibold`) is intentionally redundant: it both selects the
 * loaded font face AND keeps the cascade behaving when the
 * `PlusJakartaSans_*` faces fail to load on first cold start.
 */
const textVariants = cva("text-foreground font-sans", {
  variants: {
    variant: {
      default: "text-base",
      muted: "text-muted-foreground text-sm",
      caption: "text-xs text-muted-foreground",
      h1: "font-heading text-3xl font-bold",
      h2: "font-heading text-2xl font-bold",
      h3: "font-heading text-xl font-semibold",
      h4: "font-heading text-lg font-semibold",
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
