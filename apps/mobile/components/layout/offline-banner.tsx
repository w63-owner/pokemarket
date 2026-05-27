import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatePresence, MotiView } from "moti";
import { WifiOff } from "lucide-react-native";
import NetInfo from "@react-native-community/netinfo";

import { Text } from "@/components/ui/text";
import { duration, useReducedMotionSafe } from "@/lib/motion";
import { useThemeColor } from "@/lib/theme-colors";

/**
 * Floating "offline" banner pinned to the top safe-area.
 *
 * Subscribes to `NetInfo` directly (instead of React Query's
 * `onlineManager`) so we get the raw link-layer state even on screens
 * that don't run any query — the user should never be left wondering
 * why their tap "did nothing".
 *
 * Lives outside the `Stack` in `app/_layout.tsx`, so it floats above
 * every screen and survives navigation transitions. Banner itself is
 * `pointerEvents="none"` so it never steals taps from underlying UI.
 *
 * Hidden by default: only mounts the visible row when both `connected`
 * and `isInternetReachable` are explicitly `false`. This avoids
 * flashing the banner on cold start while NetInfo determines
 * `isInternetReachable` (which is `null` for ~500 ms).
 */
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const reduceMotion = useReducedMotionSafe();
  const destructiveForeground = useThemeColor("destructiveForeground");

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const reachable = state.isInternetReachable;
      const connected = state.isConnected;
      // Mirror the union we use in `setupQueryManagers`: treat the
      // pair as offline only when both are explicitly false. While
      // `isInternetReachable` is still `null` (initial probe), we
      // trust `isConnected` so a captive-portal Wi-Fi doesn't keep
      // the banner up forever.
      const online = reachable ?? !!connected;
      setIsOffline(!online);
    });
    return () => {
      unsub();
    };
  }, []);

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
      }}
    >
      <AnimatePresence>
        {isOffline ? (
          <MotiView
            key="offline-banner"
            from={{ opacity: reduceMotion ? 1 : 0, translateY: -16 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: -16 }}
            transition={{ type: "timing", duration: duration.fast }}
          >
            <SafeAreaView edges={["top"]} className="bg-destructive">
              <View className="flex-row items-center justify-center gap-2 px-4 py-2">
                <WifiOff size={14} color={destructiveForeground} />
                <Text
                  className="text-xs font-semibold"
                  style={{ color: destructiveForeground }}
                >
                  Vous êtes hors ligne
                </Text>
              </View>
            </SafeAreaView>
          </MotiView>
        ) : null}
      </AnimatePresence>
    </View>
  );
}
