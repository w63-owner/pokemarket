import { useEffect, useState } from "react";
import { View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { WifiOff } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { useThemeColor } from "@/lib/theme-colors";

/**
 * Thin top banner when there is no network path to the Internet. Uses
 * `NetInfo.refresh()` on mount because the listener may briefly report stale
 * `isConnected=true` immediately after startup.
 */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const destructive = useThemeColor("destructive");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let mounted = true;
    NetInfo.refresh().then((s) => {
      if (!mounted) return;
      setOffline(!(s.isConnected ?? false) || s.isInternetReachable === false);
    });

    const sub = NetInfo.addEventListener((s) => {
      const noPath =
        s.isConnected === false ||
        s.isInternetReachable === false ||
        (s.isConnected === null && !s.details);
      setOffline(noPath);
    });

    return () => {
      mounted = false;
      sub();
    };
  }, []);

  if (!offline) return null;

  return (
    <View
      className="absolute left-0 right-0 z-50 flex-row items-center gap-2 border-b border-border bg-destructive/15 px-4 py-2"
      style={{ top: insets.top, paddingTop: 10 }}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
    >
      <WifiOff size={16} color={destructive} />
      <Text className="flex-1 text-xs font-medium text-destructive">
        Hors ligne — vérifiez votre connexion
      </Text>
    </View>
  );
}
