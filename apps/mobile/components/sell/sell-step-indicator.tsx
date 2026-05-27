import { View } from "react-native";
import { MotiView } from "moti";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/cn";
import { duration, useReducedMotionSafe } from "@/lib/motion";

export type SellStep = 1 | 2 | 3;

const LABELS: Record<SellStep, string> = {
  1: "Photos",
  2: "Identification",
  3: "Détails",
};

type Props = {
  /** 1 = uploading photos, 2 = OCR / identification, 3 = filling the form. */
  current: SellStep;
};

/**
 * Three-segment progress indicator displayed at the top of the sell flow
 * so the user can see at a glance where they are in the 3-step wizard
 * (Photos → Identification → Détails).
 *
 * Visual rules:
 *  - Past + current segments use `bg-primary`.
 *  - Future segments use `bg-muted`.
 *  - The label of the active segment uses `text-foreground`, others fall
 *    back to `text-muted-foreground`.
 *  - The bar transition is animated via Moti so the fill grows when the
 *    user advances (matches the rest of the mobile motion language).
 */
export function SellStepIndicator({ current }: Props) {
  const reduceMotion = useReducedMotionSafe();
  const steps: SellStep[] = [1, 2, 3];

  return (
    <View className="gap-2 px-4 pb-2 pt-3">
      <View className="flex-row items-center gap-2">
        {steps.map((step) => {
          const isActive = step <= current;
          return (
            <MotiView
              key={step}
              animate={{ opacity: isActive ? 1 : 0.4 }}
              transition={{ type: "timing", duration: duration.fast }}
              className={cn(
                "h-1.5 flex-1 overflow-hidden rounded-full",
                isActive ? "bg-primary" : "bg-muted",
              )}
            >
              {isActive && step === current && !reduceMotion ? (
                <MotiView
                  from={{ translateX: -200 }}
                  animate={{ translateX: 200 }}
                  transition={{
                    type: "timing",
                    duration: 1400,
                    loop: true,
                  }}
                  className="h-full w-12 bg-white/30"
                />
              ) : null}
            </MotiView>
          );
        })}
      </View>
      <View className="flex-row items-center gap-2">
        {steps.map((step) => {
          const isActive = step === current;
          return (
            <View key={step} className="flex-1 items-center">
              <Text
                className={cn(
                  "text-[11px] font-medium",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
                numberOfLines={1}
              >
                {LABELS[step]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
