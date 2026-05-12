import { View } from "react-native";
import { MotiView } from "moti";
import { Button, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

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
  return (
    <MotiView
      from={{ opacity: 0, translateY: 6 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 280 }}
      className={cn(
        "items-center justify-center gap-3 px-6 py-16",
        className,
      )}
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
