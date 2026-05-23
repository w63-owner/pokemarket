import { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Text } from "@/components/ui/text";
import { useReducedMotionSafe } from "@/lib/motion";
import { useThemeColor } from "@/lib/theme-colors";

/**
 * Two-phase animated splash mirroring `apps/web/.../splash-screen.tsx`.
 *
 *  - Phase 1 ("scan"): a card-shaped frame (63/88 ratio) with a brand
 *    laser sweeping top→bottom→top, four pulsing brackets at the
 *    corners, and a soft brand glow pulse.
 *  - Phase 2 ("logo"): the wordmark springs in from scale 0.5 and the
 *    tagline fades up from below.
 *
 * Behaviour aligns with the web:
 *  - Skipped if `hasSeenSplash` flag is set in AsyncStorage (1× / install).
 *  - When Reduce Motion is on we shorten both phases and disable the
 *    laser/bracket loops so the user still sees the brand identity but
 *    in a calmer form.
 *
 * The component is mounted once at the root (above the navigator) and
 * unmounts itself after the dismiss animation, so it costs nothing past
 * first paint.
 */

const STORAGE_KEY = "pokemarket.hasSeenSplash";

const CARD_ASPECT = 63 / 88;
const CARD_WIDTH_RATIO = 0.45;
const CARD_MAX_WIDTH = 170;

const SCAN_PHASE_MS = 1700;
const SCAN_REDUCED_MS = 300;
const DISMISS_MS = 2800;
const DISMISS_REDUCED_MS = 1000;
const FADE_OUT_MS = 400;
const BRACKET_PULSE_MS = 1200;
const LASER_LOOP_MS = 1500;
const GLOW_LOOP_MS = 1500;

const BRACKETS = ["tl", "tr", "bl", "br"] as const;
type BracketPosition = (typeof BRACKETS)[number];

export function AnimatedSplash() {
  const reduceMotion = useReducedMotionSafe();

  const background = useThemeColor("background");
  const brand = useThemeColor("brand");
  const muted = useThemeColor("mutedForeground");
  const foreground = useThemeColor("foreground");

  const [phase, setPhase] = useState<"scan" | "logo" | "done">("scan");
  const [shouldRender, setShouldRender] = useState(true);
  const [decided, setDecided] = useState(false);

  const containerOpacity = useSharedValue(1);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (cancelled) return;
        if (value === "1") {
          setShouldRender(false);
        }
        setDecided(true);
      })
      .catch(() => {
        if (cancelled) return;
        setDecided(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!decided || !shouldRender) return;

    AsyncStorage.setItem(STORAGE_KEY, "1").catch(() => {});

    const scanMs = reduceMotion ? SCAN_REDUCED_MS : SCAN_PHASE_MS;
    const dismissMs = reduceMotion ? DISMISS_REDUCED_MS : DISMISS_MS;

    const t1 = setTimeout(() => setPhase("logo"), scanMs);
    const t2 = setTimeout(() => {
      containerOpacity.value = withTiming(
        0,
        { duration: FADE_OUT_MS, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setPhase)("done");
        },
      );
    }, dismissMs);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [decided, reduceMotion, shouldRender, containerOpacity]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  if (!decided || !shouldRender || phase === "done") return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.container,
        { backgroundColor: background },
        containerStyle,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: hexToRgba(brand, 0.06) },
        ]}
      />

      {phase === "scan" ? (
        <ScanPhase brand={brand} reduceMotion={reduceMotion} />
      ) : (
        <LogoPhase
          foreground={foreground}
          brand={brand}
          muted={muted}
          reduceMotion={reduceMotion}
        />
      )}
    </Animated.View>
  );
}

// ─── Phase 1 ──────────────────────────────────────────────────────────────────

function ScanPhase({
  brand,
  reduceMotion,
}: {
  brand: string;
  reduceMotion: boolean;
}) {
  const enter = useSharedValue(0);
  const laser = useSharedValue(0);
  const glow = useSharedValue(0);
  const [cardHeight, setCardHeight] = useState(0);

  useEffect(() => {
    enter.value = withTiming(1, {
      duration: 250,
      easing: Easing.out(Easing.cubic),
    });

    if (reduceMotion) {
      laser.value = 0;
      glow.value = 0.5;
      return undefined;
    }

    laser.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: LASER_LOOP_MS / 2,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0, {
          duration: LASER_LOOP_MS / 2,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      false,
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: GLOW_LOOP_MS / 2,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0, {
          duration: GLOW_LOOP_MS / 2,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(enter);
      cancelAnimation(laser);
      cancelAnimation(glow);
    };
  }, [enter, glow, laser, reduceMotion]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: interpolate(enter.value, [0, 1], [0.85, 1]) }],
  }));

  const handleCardLayout = (e: LayoutChangeEvent) => {
    setCardHeight(e.nativeEvent.layout.height);
  };

  // Drive the laser via a measured Y offset rather than a percentage
  // string — Reanimated handles `translateY` deterministically across
  // iOS/Android while string-based `top` interpolations can stutter on
  // older Hermes builds.
  const laserStyle = useAnimatedStyle(() => {
    const usable = Math.max(cardHeight - 4, 0);
    const start = usable * 0.02;
    const end = usable * 0.96;
    return {
      transform: [{ translateY: start + (end - start) * laser.value }],
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.1 * glow.value,
    shadowRadius: 6 + 14 * glow.value,
  }));

  return (
    <Animated.View
      onLayout={handleCardLayout}
      style={[
        styles.card,
        {
          width: `${CARD_WIDTH_RATIO * 100}%`,
          maxWidth: CARD_MAX_WIDTH,
          aspectRatio: CARD_ASPECT,
          borderColor: hexToRgba(brand, 0.3),
        },
        cardStyle,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: 8,
            shadowColor: brand,
            shadowOffset: { width: 0, height: 0 },
          },
          glowStyle,
        ]}
      />

      {BRACKETS.map((pos) => (
        <ScanBracket
          key={pos}
          position={pos}
          brand={brand}
          reduceMotion={reduceMotion}
        />
      ))}

      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 4,
            right: 4,
            height: 2,
            backgroundColor: brand,
            shadowColor: brand,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 8,
            elevation: 4,
          },
          laserStyle,
        ]}
      />
    </Animated.View>
  );
}

function ScanBracket({
  position,
  brand,
  reduceMotion,
}: {
  position: BracketPosition;
  brand: string;
  reduceMotion: boolean;
}) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0.5);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: BRACKET_PULSE_MS / 2,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(0.5, {
          duration: BRACKET_PULSE_MS / 2,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity, reduceMotion]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const isTop = position[0] === "t";
  const isLeft = position[1] === "l";

  const base: ViewStyle = {
    position: "absolute",
    width: 22,
    height: 22,
    borderColor: brand,
    borderStyle: "solid",
  };

  const placement: ViewStyle = {
    ...(isTop ? { top: -1 } : { bottom: -1 }),
    ...(isLeft ? { left: -1 } : { right: -1 }),
  };

  const borders: ViewStyle = {
    ...(isTop ? { borderTopWidth: 2.5 } : { borderBottomWidth: 2.5 }),
    ...(isLeft ? { borderLeftWidth: 2.5 } : { borderRightWidth: 2.5 }),
    borderTopLeftRadius: isTop && isLeft ? 6 : 0,
    borderTopRightRadius: isTop && !isLeft ? 6 : 0,
    borderBottomLeftRadius: !isTop && isLeft ? 6 : 0,
    borderBottomRightRadius: !isTop && !isLeft ? 6 : 0,
  };

  return (
    <Animated.View
      pointerEvents="none"
      style={[base, placement, borders, animStyle]}
    />
  );
}

// ─── Phase 2 ──────────────────────────────────────────────────────────────────

function LogoPhase({
  foreground,
  brand,
  muted,
  reduceMotion,
}: {
  foreground: string;
  brand: string;
  muted: string;
  reduceMotion: boolean;
}) {
  const logoScale = useSharedValue(reduceMotion ? 1 : 0.5);
  const logoOpacity = useSharedValue(0);
  const taglineY = useSharedValue(reduceMotion ? 0 : 6);
  const taglineOpacity = useSharedValue(0);

  useEffect(() => {
    logoOpacity.value = withTiming(1, {
      duration: reduceMotion ? 120 : 220,
      easing: Easing.out(Easing.cubic),
    });
    if (!reduceMotion) {
      logoScale.value = withSpring(1, {
        stiffness: 400,
        damping: 12,
        mass: 1,
      });
    }

    const taglineDelay = reduceMotion ? 80 : 200;
    taglineOpacity.value = withDelay(
      taglineDelay,
      withTiming(0.7, {
        duration: reduceMotion ? 120 : 300,
        easing: Easing.out(Easing.cubic),
      }),
    );
    if (!reduceMotion) {
      taglineY.value = withDelay(
        taglineDelay,
        withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) }),
      );
    }

    return () => {
      cancelAnimation(logoScale);
      cancelAnimation(logoOpacity);
      cancelAnimation(taglineY);
      cancelAnimation(taglineOpacity);
    };
  }, [logoOpacity, logoScale, reduceMotion, taglineOpacity, taglineY]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [{ translateY: taglineY.value }],
  }));

  return (
    <View style={styles.logoWrap}>
      <Animated.View style={logoStyle}>
        <Text
          style={{
            fontFamily: "PlusJakartaSans_800ExtraBold",
            fontSize: 36,
            letterSpacing: -0.5,
            color: foreground,
          }}
        >
          Poke
          <Text
            style={{
              color: brand,
              fontFamily: "PlusJakartaSans_800ExtraBold",
              fontSize: 36,
              letterSpacing: -0.5,
            }}
          >
            Market
          </Text>
        </Text>
      </Animated.View>

      <Animated.View style={taglineStyle}>
        <Text
          style={{
            fontSize: 11,
            letterSpacing: 2,
            color: muted,
            textTransform: "uppercase",
          }}
        >
          Attrapez-les tous
        </Text>
      </Animated.View>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a `#rrggbb` token to `rgba(r,g,b,a)` so we can compose alpha
 * for ambient glows without depending on shared-element APIs that don't
 * exist on RN's `View` style props.
 */
function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return hex;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  container: {
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    position: "relative",
    borderRadius: 8,
    borderWidth: 2,
    overflow: "visible",
  },
  logoWrap: {
    alignItems: "center",
    gap: 8,
  },
});
