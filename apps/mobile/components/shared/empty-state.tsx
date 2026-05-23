import { View } from "react-native";
import { MotiView } from "moti";
import { Button, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fadeInUp, useReducedMotionSafe } from "@/lib/motion";

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const reduceMotion = useReducedMotionSafe();
  return (
    <MotiView
      from={reduceMotion ? fadeInUp.animate : fadeInUp.from}
      animate={fadeInUp.animate}
      transition={fadeInUp.transition}
      className={cn("items-center justify-center gap-3 px-6 py-16", className)}
    >
      {icon ? (
        <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
          {icon}
        </View>
      ) : null}
      <View className="max-w-xs items-center gap-1">
        <Text variant="h4" className="text-center">
          {title}
        </Text>
        {description ? (
          <Text variant="muted" className="text-center">
            {description}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Button variant="outline" onPress={action.onPress} className="mt-2">
          {action.label}
        </Button>
      ) : null}
    </MotiView>
  );
}
