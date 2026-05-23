import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import type { ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { AnimatePresence, MotiView } from "moti";
import { cn } from "@/lib/cn";
import { useThemeColor } from "@/lib/theme-colors";
import { duration, spring } from "@/lib/motion";
import { Text } from "./text";

type TabLayout = { x: number; width: number };

type TabsContextValue = {
  value: string;
  onValueChange: (next: string) => void;
  variant: "default" | "line";
  swipeable?: boolean;
  fill?: boolean;
  registerLayout: (value: string, layout: TabLayout) => void;
  layouts: Record<string, TabLayout>;
};

const TabsContext = createContext<TabsContextValue | null>(null);

// Reanimated rejects Moti's `{ type: "spring", … }` tag — strip it and
// reuse the numeric `spring.gentle` values for the indicator slide.
const INDICATOR_SPRING = {
  damping: spring.gentle.damping,
  stiffness: spring.gentle.stiffness,
  mass: spring.gentle.mass,
};

export function Tabs({
  value,
  onValueChange,
  children,
  className,
  variant = "default",
  swipeable,
  fill,
}: {
  value: string;
  onValueChange: (next: string) => void;
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "line";
  swipeable?: boolean;
  /**
   * When `true` together with `swipeable`, the pager and each panel fill
   * the parent's height. Required when a panel hosts a virtualized list
   * (FlatList / FlashList) that needs a bounded height to render.
   */
  fill?: boolean;
}) {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const tabOrderRef = useRef<string[]>([]);
  const [layouts, setLayouts] = useState<Record<string, TabLayout>>({});
  const [pagerHeight, setPagerHeight] = useState(0);

  const registerLayout = useCallback((tabValue: string, layout: TabLayout) => {
    setLayouts((prev) => {
      const existing = prev[tabValue];
      if (
        existing &&
        Math.abs(existing.x - layout.x) < 0.5 &&
        Math.abs(existing.width - layout.width) < 0.5
      ) {
        return prev;
      }
      return { ...prev, [tabValue]: layout };
    });
  }, []);

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

  const contextValue = useMemo<TabsContextValue>(
    () => ({
      value,
      onValueChange: handleValueChange,
      variant,
      swipeable,
      fill,
      registerLayout,
      layouts,
    }),
    [
      value,
      handleValueChange,
      variant,
      swipeable,
      fill,
      registerLayout,
      layouts,
    ],
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

    // In fill mode we need a bounded height for each page so that
    // virtualized lists inside them know how tall to render. We measure
    // the pager's own layout height and forward it to every page.
    const pageStyle: ViewStyle = fill
      ? { width, height: pagerHeight }
      : { width };

    return (
      <TabsContext.Provider value={contextValue}>
        <View className={cn("flex-col", fill && "flex-1", className)}>
          {listChildren}
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            style={fill ? { flex: 1 } : undefined}
            onLayout={
              fill
                ? (e) => {
                    const h = e.nativeEvent.layout.height;
                    setPagerHeight((prev) =>
                      Math.abs(prev - h) < 0.5 ? prev : h,
                    );
                  }
                : undefined
            }
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
                style={pageStyle}
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
    <TabsContext.Provider value={contextValue}>
      <View className={cn("flex-col", className)}>{children}</View>
    </TabsContext.Provider>
  );
}

export function TabsList({ children }: { children: React.ReactNode }) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("TabsList must be inside Tabs");

  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const initializedRef = useRef(false);
  const brand = useThemeColor("brand");

  // Drive the indicator whenever the active tab or its measured layout
  // changes. The first frame is snapped without spring to avoid a
  // disgraceful fly-in from x=0; subsequent frames spring.
  const activeLayout = ctx.layouts[ctx.value];
  React.useEffect(() => {
    if (!activeLayout) return;
    if (!initializedRef.current) {
      indicatorX.value = activeLayout.x;
      indicatorWidth.value = activeLayout.width;
      initializedRef.current = true;
      return;
    }
    indicatorX.value = withSpring(activeLayout.x, INDICATOR_SPRING);
    indicatorWidth.value = withSpring(activeLayout.width, INDICATOR_SPRING);
  }, [activeLayout, indicatorX, indicatorWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
  }));

  if (ctx.variant === "line") {
    return (
      <View className="relative flex-row border-b border-border">
        {children}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              bottom: -1,
              left: 0,
              height: 2,
              backgroundColor: brand,
              borderRadius: 1,
            },
            indicatorStyle,
          ]}
        />
      </View>
    );
  }

  return (
    <View className="relative flex-row rounded-xl bg-muted p-1">
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 4,
            bottom: 4,
            left: 0,
            backgroundColor: "transparent",
          },
          indicatorStyle,
        ]}
      >
        <View className="h-full w-full rounded-lg bg-background" />
      </Animated.View>
      {children}
    </View>
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

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      ctx.registerLayout(value, { x, width });
    },
    [ctx, value],
  );

  const isString = typeof children === "string" || typeof children === "number";

  return (
    <Pressable
      onPress={() => ctx.onValueChange(value)}
      onLayout={handleLayout}
      className={cn(
        ctx.variant === "line"
          ? "flex-1 items-center justify-center px-3 py-3"
          : "flex-1 items-center justify-center rounded-lg px-3 py-2",
      )}
    >
      {isString ? (
        <Text
          className={cn(
            "text-sm font-medium",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {children}
        </Text>
      ) : (
        // Children may already include their own <Text> + icon layout
        // (see ProfileTabs, offers, transactions). Wrapping in a <View>
        // with opacity preserves the structure without producing the
        // "<View> can't be a child of <Text>" RN warning.
        <View style={{ opacity: active ? 1 : 0.7 }}>{children}</View>
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

  // In swipeable mode all panels are always mounted side-by-side inside
  // the horizontal pager — no AnimatePresence cross-fade, no null.
  if (ctx.swipeable) {
    // In fill mode the panel must take the full pager height (no top
    // margin) so its child list can flex into it; otherwise we keep the
    // legacy `mt-3` spacing used by the scroll-based ProfileTabs layout.
    return <View className={ctx.fill ? "flex-1" : "mt-3"}>{children}</View>;
  }

  return (
    <View className="mt-3">
      <AnimatePresence exitBeforeEnter>
        {ctx.value === value ? (
          <MotiView
            key={value}
            from={{ opacity: 0, translateY: 4 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: -4 }}
            transition={{ type: "timing", duration: duration.fast }}
          >
            {children}
          </MotiView>
        ) : null}
      </AnimatePresence>
    </View>
  );
}
