import React, { createContext, useCallback, useContext, useRef } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { cn } from "@/lib/cn";
import { Text } from "./text";

type TabsContextValue = {
  value: string;
  onValueChange: (next: string) => void;
  variant?: "pill" | "line";
  swipeable?: boolean;
};

const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({
  value,
  onValueChange,
  children,
  className,
  variant,
  swipeable,
}: {
  value: string;
  onValueChange: (next: string) => void;
  children: React.ReactNode;
  className?: string;
  variant?: "pill" | "line";
  swipeable?: boolean;
}) {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  // Populated synchronously during render so callbacks always see the latest order
  const tabOrderRef = useRef<string[]>([]);

  const handleValueChange = useCallback(
    (next: string) => {
      onValueChange(next);
      if (swipeable && scrollRef.current) {
        const idx = tabOrderRef.current.indexOf(next);
        if (idx >= 0) {
          scrollRef.current.scrollTo({ x: idx * width, animated: true });
        }
      }
    },
    [onValueChange, swipeable, width],
  );

  if (swipeable) {
    const listChildren: React.ReactNode[] = [];
    const contentChildren: React.ReactElement[] = [];
    tabOrderRef.current = [];

    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.type === TabsContent) {
        contentChildren.push(child as React.ReactElement);
        tabOrderRef.current.push((child.props as { value: string }).value);
      } else {
        listChildren.push(child);
      }
    });

    return (
      <TabsContext.Provider
        value={{ value, onValueChange: handleValueChange, variant, swipeable }}
      >
        <View className={cn("flex-col", className)}>
          {listChildren}
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / width);
              const newValue = tabOrderRef.current[idx];
              if (newValue && newValue !== value) {
                onValueChange(newValue);
              }
            }}
          >
            {contentChildren.map((child) => (
              <View
                key={(child.props as { value: string }).value}
                style={{ width }}
              >
                {child}
              </View>
            ))}
          </ScrollView>
        </View>
      </TabsContext.Provider>
    );
  }

  return (
    <TabsContext.Provider value={{ value, onValueChange, variant }}>
      <View className={cn("flex-col", className)}>{children}</View>
    </TabsContext.Provider>
  );
}

export function TabsList({ children }: { children: React.ReactNode }) {
  return <View className="flex-row rounded-xl bg-muted p-1">{children}</View>;
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
      {typeof children === "string" || typeof children === "number" ? (
        <Text
          className={cn(
            "text-sm font-medium",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {children}
        </Text>
      ) : (
        children
      )}
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
  // In swipeable mode all panels are always mounted (side-by-side in the pager)
  if (!ctx.swipeable && ctx.value !== value) return null;
  return <View className="mt-3">{children}</View>;
}
