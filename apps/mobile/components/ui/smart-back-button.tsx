import { Platform, Pressable, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { BlurView } from "expo-blur";
import { MotiView } from "moti";

import { haptic } from "@/lib/haptics";
import { tapScale } from "@/lib/motion";
import { useThemeColor } from "@/lib/theme-colors";

export type SmartBackButtonVariant = "default" | "overlay";

export type SmartBackButtonProps = {
  /**
   * Where to send the user when the navigator stack is empty
   * (e.g. deep link or fresh app launch). Defaults to `/`.
   */
  fallbackHref?: string;
  /**
   * Render mode.
   *
   *  - `default` (opaque): card-coloured circle with a foreground chevron.
   *    Use on regular screens with an opaque header bar.
   *  - `overlay` (glass): semi-transparent black circle (with a soft
   *    BlurView on iOS) and a white chevron — designed to float over a
   *    photo / video / hero carousel where the chevron must stay
   *    legible regardless of the background.
   */
  variant?: SmartBackButtonVariant;
};

export function SmartBackButton({
  fallbackHref = "/",
  variant = "default",
}: SmartBackButtonProps) {
  const router = useRouter();
  const defaultIconColor = useThemeColor("foreground");
  const isOverlay = variant === "overlay";

  const handlePress = () => {
    haptic("tap");
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackHref as never);
    }
  };

  if (isOverlay) {
    // BlurView is only meaningful on iOS — on Android we fall back to a
    // slightly darker rgba fill so the chevron stays legible against any
    // hero photo (Android's BlurView is approximative and blocks taps in
    // some Expo SDKs, hence the conservative opaque fallback).
    return (
      <Pressable
        onPress={handlePress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Retour"
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        {({ pressed }) => (
          <MotiView
            animate={tapScale.animate(pressed)}
            transition={tapScale.transition}
            style={{ width: 40, height: 40 }}
          >
            {Platform.OS === "ios" ? (
              <BlurView
                intensity={30}
                tint="dark"
                style={{
                  width: 40,
                  height: 40,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(0,0,0,0.30)",
                }}
              >
                <ChevronLeft size={22} color="#fff" />
              </BlurView>
            ) : (
              <View
                style={{
                  width: 40,
                  height: 40,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(0,0,0,0.40)",
                }}
              >
                <ChevronLeft size={22} color="#fff" />
              </View>
            )}
          </MotiView>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Retour"
      className="h-10 w-10 items-center justify-center rounded-full bg-card"
    >
      {({ pressed }) => (
        <MotiView
          animate={tapScale.animate(pressed)}
          transition={tapScale.transition}
          style={{ alignItems: "center", justifyContent: "center" }}
        >
          <ChevronLeft size={22} color={defaultIconColor} />
        </MotiView>
      )}
    </Pressable>
  );
}
