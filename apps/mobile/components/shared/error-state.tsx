import { View } from "react-native";
import { MotiView } from "moti";
import { AlertTriangle } from "lucide-react-native";
import { Button, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fadeInUp, useReducedMotionSafe } from "@/lib/motion";
import { useThemeColor } from "@/lib/theme-colors";

type ErrorStateProps = {
  title?: string;
  description: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onPress: () => void;
  };
  /** `card` mirrors feed/list destructive bordered panels. */
  variant?: "default" | "card";
  className?: string;
};

export function ErrorState({
  title = "Une erreur est survenue",
  description,
  icon,
  action,
  variant = "default",
  className,
}: ErrorStateProps) {
  const reduceMotion = useReducedMotionSafe();
  const destructive = useThemeColor("destructive");

  const shell =
    variant === "card"
      ? "w-full max-w-md items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-6"
      : "items-center gap-3 px-6 py-16";

  return (
    <MotiView
      from={reduceMotion ? fadeInUp.animate : fadeInUp.from}
      animate={fadeInUp.animate}
      transition={fadeInUp.transition}
      className={cn(shell, className)}
    >
      <View className="h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        {icon ?? <AlertTriangle size={26} color={destructive} />}
      </View>
      <View className="max-w-xs items-center gap-1">
        <Text variant="h4" className="text-center text-destructive">
          {title}
        </Text>
        <Text variant="muted" className="text-center">
          {description}
        </Text>
      </View>
      {action ? (
        <Button variant="outline" onPress={action.onPress} className="mt-2">
          {action.label}
        </Button>
      ) : null}
    </MotiView>
  );
}
