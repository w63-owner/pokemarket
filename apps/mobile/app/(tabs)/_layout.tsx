import { Tabs } from "expo-router";
import {
  Heart,
  MessageCircle,
  PlusCircle,
  Search,
  User,
} from "lucide-react-native";
import { useEffect, useRef, type ComponentType } from "react";
import {
  Platform,
  Pressable,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { MotiView } from "moti";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { Text } from "@/components/ui/text";
import { useUnreadCount } from "@/hooks/use-conversations";
import { useThemeColor } from "@/lib/theme-colors";
import { useEffectiveTheme } from "@/lib/stores/theme";
import { spring, useReducedMotionSafe } from "@/lib/motion";

type IconProps = { size?: number; color?: string; strokeWidth?: number };

type TabConfig = {
  name: string;
  label: string;
  Icon: ComponentType<IconProps>;
};

const TABS: TabConfig[] = [
  { name: "index", label: "Recherche", Icon: Search },
  { name: "favorites", label: "Favoris", Icon: Heart },
  { name: "sell", label: "Vendre", Icon: PlusCircle },
  { name: "inbox", label: "Messages", Icon: MessageCircle },
  { name: "profile", label: "Profil", Icon: User },
];

// Visual inset matching the previous per-tab indicator (which sat with
// `left/right: 14` inside its tab cell). Keeps the underline horizontally
// centred under the icon as the indicator slides between tabs.
const INDICATOR_INSET = 14;

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { data: unreadCount = 0 } = useUnreadCount();
  const scheme = useEffectiveTheme();
  const reduceMotion = useReducedMotionSafe();
  const PRIMARY = useThemeColor("primary");
  const MUTED = useThemeColor("mutedForeground");
  const cardColor = useThemeColor("card");
  const borderColor = useThemeColor("border");
  const destructive = useThemeColor("destructive");
  const primaryForeground = useThemeColor("primaryForeground");

  const isDark = scheme === "dark";
  const opaqueBg = cardColor;
  const blurredBg = isDark
    ? "rgba(26, 26, 46, 0.82)"
    : "rgba(255, 255, 255, 0.82)";

  // ─── Sliding indicator ──────────────────────────────────────────────────
  //
  // We track each tab Pressable's `onLayout` (x + width) so the indicator
  // can be positioned absolutely *outside* the per-tab tree (vs the old
  // per-tab `MotiView` that mounted/unmounted with `isFocused`). This
  // gives us a single Animated.View that physically slides between tabs
  // — visually equivalent to the web's framer-motion `layoutId`.
  const tabLayoutsRef = useRef<Array<{ x: number; width: number } | null>>(
    Array.from({ length: TABS.length }, () => null),
  );
  const layoutsBumpVersion = useSharedValue(0);
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const focusedIndex = useSharedValue(state.index);

  useEffect(() => {
    focusedIndex.value = state.index;
  }, [focusedIndex, state.index]);

  // Drive the indicator from the focused tab index — recompute whenever
  // `state.index` changes OR a layout bump fires (initial measure /
  // rotation). The derived value reads `layoutsBumpVersion` explicitly
  // so Reanimated re-runs the worklet on the UI thread when layouts
  // change (refs aren't reactive on their own).
  useDerivedValue(() => {
    const bump = layoutsBumpVersion.value;
    const layouts = tabLayoutsRef.current;
    const layout = layouts[focusedIndex.value];
    if (!layout) return bump;
    const targetX = layout.x + INDICATOR_INSET;
    const targetWidth = Math.max(layout.width - INDICATOR_INSET * 2, 0);
    if (reduceMotion) {
      indicatorX.value = targetX;
      indicatorWidth.value = targetWidth;
    } else {
      indicatorX.value = withSpring(targetX, spring.gentle);
      indicatorWidth.value = withSpring(targetWidth, spring.gentle);
    }
    return bump;
  });

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
  }));

  const handleTabLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    const layouts = tabLayoutsRef.current;
    const prev = layouts[index];
    if (prev && prev.x === x && prev.width === width) return;
    layouts[index] = { x, width };
    // Bump the shared value so the derived indicator recomputes on the
    // UI thread (refs aren't reactive to derived-values otherwise).
    layoutsBumpVersion.value = layoutsBumpVersion.value + 1;
  };

  return (
    <View>
      <BlurView
        intensity={Platform.OS === "ios" ? 60 : 0}
        tint={isDark ? "dark" : "light"}
        style={{
          backgroundColor: Platform.OS === "ios" ? blurredBg : opaqueBg,
          borderTopWidth: 0.5,
          borderTopColor: borderColor,
          paddingBottom: insets.bottom,
        }}
      >
        <View className="flex-row items-stretch justify-around">
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: 0,
                left: 0,
                height: 2,
                borderRadius: 999,
                backgroundColor: PRIMARY,
              },
              indicatorStyle,
            ]}
          />

          {TABS.map((tab, index) => {
            const routeIndex = state.routes.findIndex(
              (r) => r.name === tab.name,
            );
            const route = state.routes[routeIndex];
            if (!route) return null;

            const isFocused = state.index === routeIndex;
            const showBadge =
              tab.name === "inbox" &&
              typeof unreadCount === "number" &&
              unreadCount > 0;
            const badgeValue = showBadge
              ? unreadCount > 99
                ? "99+"
                : String(unreadCount)
              : null;

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({ type: "tabLongPress", target: route.key });
            };

            const tintColor = isFocused ? PRIMARY : MUTED;
            const Icon = tab.Icon;

            return (
              <Pressable
                key={tab.name}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={tab.label}
                onPress={onPress}
                onLongPress={onLongPress}
                onLayout={handleTabLayout(index)}
                className="relative flex-1 items-center justify-start pb-1 pt-2"
              >
                <MotiView
                  animate={{ scale: isFocused ? 1 : 0.94 }}
                  transition={spring.snappy}
                  style={{ position: "relative" }}
                >
                  <Icon
                    size={22}
                    color={tintColor}
                    strokeWidth={isFocused ? 2.2 : 2}
                  />
                  {badgeValue !== null && (
                    <View
                      accessibilityLabel={`${unreadCount} message${unreadCount > 1 ? "s" : ""} non lu${unreadCount > 1 ? "s" : ""}`}
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -8,
                        minWidth: 16,
                        height: 16,
                        paddingHorizontal: 4,
                        borderRadius: 999,
                        backgroundColor: destructive,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: primaryForeground,
                          fontSize: 9,
                          fontWeight: "700",
                          lineHeight: 12,
                        }}
                      >
                        {badgeValue}
                      </Text>
                    </View>
                  )}
                </MotiView>

                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "500",
                    color: tintColor,
                    marginTop: 2,
                  }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="favorites" />
      <Tabs.Screen name="sell" />
      <Tabs.Screen name="inbox" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
