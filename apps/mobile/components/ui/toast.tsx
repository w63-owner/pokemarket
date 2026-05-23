import { useEffect, useRef } from "react";
import { Dimensions, Pressable, View } from "react-native";
import { create } from "zustand";
import { AnimatePresence, MotiView } from "moti";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react-native";

import { Text } from "./text";
import { useThemeColors, type ThemeColorName } from "@/lib/theme-colors";
import { duration, spring } from "@/lib/motion";

// ─── Variant model ───────────────────────────────────────────────────────────

type ToastType = "default" | "success" | "error" | "warning" | "info";

type ToastAction = { label: string; onPress: () => void };

type ToastOptions = {
  description?: string;
  action?: ToastAction;
  duration?: number;
};

type ToastItem = {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  action?: ToastAction;
  duration: number;
};

const DEFAULT_DURATION = 3500;
// Approximate height of the bottom tab bar (cf. tab-bar layout). Toast
// floats this much above the bottom safe area so it never collides
// with the tab bar — matches the web Sonner offset.
const TAB_BAR_GAP = 80;
const SWIPE_DISMISS_DISTANCE = 80;
const SWIPE_DISMISS_VELOCITY = 800;
const SCREEN_WIDTH = Dimensions.get("window").width;
// Reanimated requires a plain object — strip Moti's `{ type: "spring" }`
// tag and reuse `spring.snappy`'s numeric values for the swipe spring.
const SNAPBACK_SPRING = {
  damping: spring.snappy.damping,
  stiffness: spring.snappy.stiffness,
  mass: spring.snappy.mass,
};

// ─── Store ───────────────────────────────────────────────────────────────────

type Store = {
  items: ToastItem[];
  push: (
    t: Omit<ToastItem, "id" | "duration"> & { duration?: number },
  ) => string;
  dismiss: (id: string) => void;
};

const useStore = create<Store>((set) => ({
  items: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({
      items: [
        ...s.items,
        { ...t, id, duration: t.duration ?? DEFAULT_DURATION },
      ],
    }));
    return id;
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

// ─── Public API ──────────────────────────────────────────────────────────────

function normalizeOptions(arg?: string | ToastOptions): {
  description?: string;
  action?: ToastAction;
  duration?: number;
} {
  if (!arg) return {};
  if (typeof arg === "string") return { description: arg };
  return arg;
}

function show(
  type: ToastType,
  title: string,
  arg?: string | ToastOptions,
): string {
  const opts = normalizeOptions(arg);
  return useStore.getState().push({
    type,
    title,
    description: opts.description,
    action: opts.action,
    duration: opts.duration,
  });
}

export const toast = {
  default: (title: string, arg?: string | ToastOptions) =>
    show("default", title, arg),
  success: (title: string, arg?: string | ToastOptions) =>
    show("success", title, arg),
  error: (title: string, arg?: string | ToastOptions) =>
    show("error", title, arg),
  warning: (title: string, arg?: string | ToastOptions) =>
    show("warning", title, arg),
  info: (title: string, arg?: string | ToastOptions) =>
    show("info", title, arg),
  dismiss: (id: string) => useStore.getState().dismiss(id),
};

// ─── Variant → icon + color mapping ──────────────────────────────────────────

const ICON_MAP: Record<
  ToastType,
  React.ComponentType<{ size: number; color: string }> | null
> = {
  default: null,
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

// `info` falls back to `brand-secondary` (deep navy on light, light
// blue on dark) since the design system has no dedicated `info` token.
const ACCENT_TOKEN: Record<ToastType, ThemeColorName> = {
  default: "foreground",
  success: "success",
  error: "destructive",
  warning: "warning",
  info: "brandSecondary",
};

// ─── Viewport ────────────────────────────────────────────────────────────────

export function ToastViewport() {
  const items = useStore((s) => s.items);
  const dismiss = useStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: insets.bottom + TAB_BAR_GAP,
        left: 16,
        right: 16,
      }}
    >
      <AnimatePresence>
        {items.map((item) => (
          <ToastRow
            key={item.id}
            item={item}
            onDismiss={() => dismiss(item.id)}
          />
        ))}
      </AnimatePresence>
    </View>
  );
}

// ─── Row (with swipe-to-dismiss + auto-dismiss) ──────────────────────────────

function ToastRow({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  const colors = useThemeColors();
  const Icon = ICON_MAP[item.type];
  const accent = colors[ACCENT_TOKEN[item.type]];

  const translateX = useSharedValue(0);
  const dismissed = useRef(false);

  const dismissOnce = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    onDismiss();
  };

  // Auto-dismiss timer. Cleared on unmount (swipe / manual dismiss) so
  // we never trigger a second set-state after the toast is gone.
  useEffect(() => {
    const handle = setTimeout(dismissOnce, item.duration);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.duration]);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      const shouldDismiss =
        Math.abs(translateX.value) > SWIPE_DISMISS_DISTANCE ||
        Math.abs(e.velocityX) > SWIPE_DISMISS_VELOCITY;
      if (shouldDismiss) {
        const sign = translateX.value >= 0 ? 1 : -1;
        translateX.value = withTiming(
          SCREEN_WIDTH * sign,
          { duration: duration.fast },
          (finished) => {
            if (finished) runOnJS(dismissOnce)();
          },
        );
      } else {
        translateX.value = withSpring(0, SNAPBACK_SPRING);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const ratio = Math.min(1, Math.abs(translateX.value) / SCREEN_WIDTH);
    return {
      transform: [{ translateX: translateX.value }],
      opacity: 1 - ratio,
    };
  });

  return (
    <MotiView
      from={{ opacity: 0, translateY: 20 }}
      animate={{ opacity: 1, translateY: 0 }}
      exit={{ opacity: 0, translateY: 20 }}
      transition={{ type: "timing", duration: duration.fast }}
      className="mb-2"
    >
      <GestureDetector gesture={pan}>
        <Animated.View
          style={animatedStyle}
          className="flex-row items-start gap-3 rounded-xl border border-border bg-card p-3 shadow"
        >
          {Icon ? (
            <View className="pt-0.5">
              <Icon size={20} color={accent} />
            </View>
          ) : null}
          <View className="min-w-0 flex-1">
            <Text className="font-semibold" numberOfLines={2}>
              {item.title}
            </Text>
            {item.description ? (
              <Text variant="muted" className="text-sm" numberOfLines={3}>
                {item.description}
              </Text>
            ) : null}
          </View>
          {item.action ? (
            <Pressable
              onPress={() => {
                item.action!.onPress();
                dismissOnce();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={item.action.label}
            >
              <Text className="text-sm font-semibold" style={{ color: accent }}>
                {item.action.label}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={dismissOnce}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <X size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </Animated.View>
      </GestureDetector>
    </MotiView>
  );
}
