import { createContext, useContext } from "react";
import { Pressable, View } from "react-native";
import { cn } from "@/lib/cn";
import { Text } from "./text";

type TabsContextValue = {
  value: string;
  onValueChange: (next: string) => void;
};
const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string;
  onValueChange: (next: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <View className={cn("flex-col", className)}>{children}</View>
    </TabsContext.Provider>
  );
}

export function TabsList({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row rounded-xl bg-muted p-1">{children}</View>
  );
}

export function TabsTrigger({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("TabsTrigger must be inside Tabs");
  const active = ctx.value === value;
  return (
    <Pressable
      onPress={() => ctx.onValueChange(value)}
      className={cn(
        "flex-1 items-center justify-center rounded-lg px-3 py-2",
        active ? "bg-background" : "bg-transparent",
      )}
    >
      <Text className={cn("text-sm font-medium", active ? "text-foreground" : "text-muted-foreground")}>
        {children}
      </Text>
    </Pressable>
  );
}

export function TabsContent({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("TabsContent must be inside Tabs");
  if (ctx.value !== value) return null;
  return <View className="mt-3">{children}</View>;
}
