import { View, type ViewProps } from "react-native";
import { Text } from "./text";
import { cn } from "@/lib/cn";

export function Card({ className, ...rest }: ViewProps) {
  return (
    <View
      className={cn(
        "rounded-2xl border border-border bg-card p-4",
        className as string,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: ViewProps) {
  return (
    <View
      className={cn("mb-3 flex-col gap-1", className as string)}
      {...rest}
    />
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <Text variant="h4">{children}</Text>;
}

export function CardDescription({ children }: { children: React.ReactNode }) {
  return <Text variant="muted">{children}</Text>;
}

export function CardContent({ className, ...rest }: ViewProps) {
  return <View className={cn(className as string)} {...rest} />;
}

export function CardFooter({ className, ...rest }: ViewProps) {
  return (
    <View
      className={cn("mt-4 flex-row gap-2", className as string)}
      {...rest}
    />
  );
}
