import { useEffect, useState, useCallback, useRef } from "react";
import { View } from "react-native";
import { MotiView, AnimatePresence } from "moti";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { Clock, AlertTriangle } from "lucide-react-native";
import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  duration as motionDuration,
  spring,
  useReducedMotionSafe,
} from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { useThemeColors } from "@/lib/theme-colors";

type CountdownTimerProps = {
  expiresAt: Date;
  onExpired?: () => void;
  className?: string;
};

const URGENT_THRESHOLD_MIN = 5;

const AnimatedClock = Animated.createAnimatedComponent(Clock);

function getTimeLeft(expiresAt: Date) {
  const diff = Math.max(0, expiresAt.getTime() - Date.now());
  const minutes = Math.floor(diff / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return { minutes, seconds, total: diff };
}

/**
 * Reanimated pulse on the Clock icon (mirrors `animate-pulse` on the web).
 * Animates `opacity` 1 → 0.4 → 1 in a 1.4s loop while `active` is true,
 * gently snapping back to 1 when the urgent state ends. Respects the
 * "Reduce Motion" accessibility flag to comply with iOS guidelines.
 */
function useUrgentPulseStyle(active: boolean, reduceMotion: boolean) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (active && !reduceMotion) {
      // Custom: 700 ms half-cycle (≈1.4 s loop) tuned for the iOS
      // `animate-pulse` cadence — intentionally slower than
      // `duration.dramatic` (800 ms one-shot) to read as an ambient
      // urgency cue rather than a discrete tap-style animation.
      opacity.value = withRepeat(
        withTiming(0.4, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(opacity);
      opacity.value = withTiming(1, { duration: motionDuration.fast });
    }

    return () => {
      cancelAnimation(opacity);
    };
  }, [active, opacity, reduceMotion]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

export function CountdownTimer({
  expiresAt,
  onExpired,
  className,
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(expiresAt));
  const [expired, setExpired] = useState(false);
  const reduceMotion = useReducedMotionSafe();
  const urgentWarnedRef = useRef(false);

  const tick = useCallback(() => {
    const t = getTimeLeft(expiresAt);
    setTimeLeft(t);
    if (t.total <= 0) {
      setExpired(true);
      onExpired?.();
    }
  }, [expiresAt, onExpired]);

  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  const isUrgent =
    timeLeft.total > 0 && timeLeft.minutes < URGENT_THRESHOLD_MIN;

  useEffect(() => {
    if (expired) {
      urgentWarnedRef.current = false;
      return;
    }
    if (isUrgent && !reduceMotion && !urgentWarnedRef.current) {
      urgentWarnedRef.current = true;
      haptic("warning");
    }
    if (!isUrgent) urgentWarnedRef.current = false;
  }, [expired, isUrgent, reduceMotion]);

  const pulseStyle = useUrgentPulseStyle(isUrgent, reduceMotion);
  const colors = useThemeColors();

  return (
    <AnimatePresence>
      {expired ? (
        <MotiView
          key="expired"
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={spring.gentle}
          className={cn(
            "flex-row items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3",
            className,
          )}
        >
          <AlertTriangle size={20} color={colors.destructive} />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-destructive">
              Session expirée
            </Text>
            <Text className="text-xs text-destructive/70">
              Le délai de paiement a expiré. Veuillez recommencer.
            </Text>
          </View>
        </MotiView>
      ) : (
        <MotiView
          key="active"
          from={{ opacity: 0, translateY: -10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={spring.gentle}
          className={cn(
            "flex-row items-center gap-3 rounded-xl border px-4 py-3",
            isUrgent
              ? "border-destructive/30 bg-destructive/5"
              : "border-border bg-muted/50",
            className,
          )}
        >
          <AnimatedClock
            size={20}
            color={isUrgent ? colors.destructive : colors.mutedForeground}
            style={pulseStyle}
          />
          <View className="flex-1">
            <Text variant="caption">Temps restant pour finaliser</Text>
            <Text
              className={cn(
                "text-lg font-bold tabular-nums",
                isUrgent ? "text-destructive" : "text-foreground",
              )}
            >
              {String(timeLeft.minutes).padStart(2, "0")}:
              {String(timeLeft.seconds).padStart(2, "0")}
            </Text>
          </View>
        </MotiView>
      )}
    </AnimatePresence>
  );
}
