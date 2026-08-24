import { Text } from "react-native";

import { cn } from "@/lib/cn";

type BrandWordmarkProps = {
  variant?: "header" | "display";
};

export function BrandWordmark({ variant = "header" }: BrandWordmarkProps) {
  const typography =
    variant === "display"
      ? "font-display text-4xl leading-[48px] tracking-tight"
      : "font-heading text-xl";

  return (
    <Text className={cn(typography, "pr-1 text-foreground")}>
      TheDeck
      <Text className={cn(typography, "text-brand")}>Dealr</Text>
    </Text>
  );
}
