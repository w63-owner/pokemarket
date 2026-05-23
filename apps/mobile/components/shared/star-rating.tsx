import { Pressable, View } from "react-native";
import { Star } from "lucide-react-native";
import { cn } from "@/lib/cn";

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = {
  sm: 14,
  md: 18,
  lg: 22,
};

type Props = {
  rating: number;
  maxRating?: number;
  size?: Size;
  interactive?: boolean;
  onChange?: (rating: number) => void;
  className?: string;
};

const FILLED = "#f59e0b";
const EMPTY = "#cbd5e1";

/**
 * Renders a 0..maxRating star bar with fractional fills (e.g. 4.3 → 4
 * full stars + 30% of the 5th). When `interactive`, taps emit the
 * 1-indexed rating selected.
 */
export function StarRating({
  rating,
  maxRating = 5,
  size = "md",
  interactive = false,
  onChange,
  className,
}: Props) {
  const px = SIZE_PX[size];
  return (
    <View className={cn("flex-row items-center gap-0.5", className)}>
      {Array.from({ length: maxRating }).map((_, i) => {
        const fill = Math.min(Math.max(rating - i, 0), 1);
        return (
          <Pressable
            key={i}
            disabled={!interactive}
            onPress={() => interactive && onChange?.(i + 1)}
            hitSlop={interactive ? 4 : undefined}
          >
            <View>
              <Star size={px} color={EMPTY} fill={EMPTY} strokeWidth={1.5} />
              {fill > 0 ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: px * fill,
                    height: px,
                    overflow: "hidden",
                  }}
                >
                  <Star
                    size={px}
                    color={FILLED}
                    fill={FILLED}
                    strokeWidth={1.5}
                  />
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
