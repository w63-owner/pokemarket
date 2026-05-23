import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils";

type PriceDisplaySize = "sm" | "md" | "lg";

const sizeClasses: Record<PriceDisplaySize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
};

interface PriceDisplayProps {
  price: number;
  size?: PriceDisplaySize;
  className?: string;
}

export function PriceDisplay({
  price,
  size = "md",
  className,
}: PriceDisplayProps) {
  return (
    <span
      className={cn(
        "font-display text-primary font-bold",
        sizeClasses[size],
        className,
      )}
    >
      {formatPrice(price)}
    </span>
  );
}
