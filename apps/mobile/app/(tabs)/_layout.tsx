import { Tabs } from "expo-router";
import {
  Heart,
  MessageCircle,
  PlusCircle,
  Search,
  User,
} from "lucide-react-native";
import type { ComponentType } from "react";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { MotiView } from "moti";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { Text } from "@/components/ui/text";
import { useUnreadCount } from "@/hooks/use-conversations";

const PRIMARY = "#E63946";
const MUTED = "#94a3b8";

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

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { data: unreadCount = 0 } = useUnreadCount();

  return (
    <BlurView
      intensity={Platform.OS === "ios" ? 60 : 0}
      tint="light"
      style={{
        backgroundColor:
          Platform.OS === "ios"
            ? "rgba(255, 255, 255, 0.82)"
            : "rgba(255, 255, 255, 1)",
        borderTopWidth: 0.5,
        borderTopColor: "rgb(226 232 240)",
        paddingBottom: insets.bottom,
      }}
    >
      <View className="flex-row items-stretch justify-around">
        {TABS.map((tab) => {
          const routeIndex = state.routes.findIndex(
            (r) => r.name === tab.name,
          );
          const route = state.routes[routeIndex];
          if (!route) return null;

          const isFocused = state.index === routeIndex;
          const showBadge =
            tab.name === "inbox" && typeof unreadCount === "number" && unreadCount > 0;
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
              className="relative flex-1 items-center justify-start pb-1 pt-2"
            >
              {isFocused && (
                <MotiView
                  from={{ opacity: 0, scaleX: 0.4 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ type: "timing", duration: 220 }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 14,
                    right: 14,
                    height: 2,
                    borderRadius: 999,
                    backgroundColor: PRIMARY,
                  }}
                />
              )}

              <MotiView
                animate={{ scale: isFocused ? 1 : 0.94 }}
                transition={{ type: "spring", damping: 18, stiffness: 220 }}
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
                      backgroundColor: "#EF4444",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
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
