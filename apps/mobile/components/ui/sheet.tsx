import type { ComponentProps } from "react";
import { useEffect } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  side?: "bottom" | "top";
  className?: string;
  /**
   * Optional sticky footer rendered outside the scrollable content area.
   * Useful for action buttons (e.g. Reset / Apply) that must stay visible
   * even when the sheet body is scrollable.
   */
  footer?: React.ReactNode;
  /**
   * Snap points expressed as percentage strings (e.g. `"90%"`). Only the
   * first value is used; the sheet then has that fixed height. If omitted
   * the sheet hugs its content (capped at 92% of the screen).
   */
  snapPoints?: string[];
};

function parseSnap(snap?: string): number | null {
  if (!snap) return null;
  const m = /^(\d+(?:\.\d+)?)%$/.exec(snap);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
const SPRING_CONFIG = { damping: 22, stiffness: 220, mass: 0.7 };

export function Sheet({
  open,
  onOpenChange,
  children,
  side = "bottom",
  className,
  footer,
  snapPoints,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const snapPercent = parseSnap(snapPoints?.[0]);
  const sheetHeight =
    snapPercent != null ? (windowH * snapPercent) / 100 : null;
  // Distance we have to translate the sheet down to take it fully off-screen.
  // Using window height as a safe fallback when no snap is given.
  const offscreenY = (sheetHeight ?? windowH) + insets.bottom + 80;

  const translateY = useSharedValue(offscreenY);
  const startY = useSharedValue(0);

  useEffect(() => {
    if (open) {
      // Snap to off-screen first so the next spring animates from below.
      translateY.value = offscreenY;
      translateY.value = withSpring(0, SPRING_CONFIG);
    }
  }, [open, offscreenY, translateY]);

  const close = () => onOpenChange(false);

  const pan = Gesture.Pan()
    .activeOffsetY([-14, 14])
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateY.value = Math.max(0, startY.value + e.translationY);
    })
    .onEnd((e) => {
      if (
        translateY.value > DISMISS_DISTANCE ||
        e.velocityY > DISMISS_VELOCITY
      ) {
        translateY.value = withTiming(
          offscreenY,
          { duration: 220 },
          (finished) => {
            if (finished) runOnJS(close)();
          },
        );
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // The "top" variant is a simpler dropdown — no drag-to-dismiss for now.
  if (side === "top") {
    return (
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={close}
      >
        <Pressable onPress={close} className="flex-1 justify-start bg-black/50">
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={{ paddingTop: insets.top + 16, paddingBottom: 16 }}
              className={cn(
                "rounded-b-3xl border-b border-border bg-card px-4",
                className,
              )}
            >
              {children}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent
    >
      {/* GestureHandlerRootView must be INSIDE Modal — on Android the Modal
          opens a separate native window that isn't reachable from the app
          root's gesture handler. Without this, Gesture.Pan() never fires. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable onPress={close} className="flex-1 justify-end bg-black/50">
          <Pressable onPress={(e) => e.stopPropagation()}>
            <GestureDetector gesture={pan}>
              <Animated.View
                style={[
                  {
                    paddingBottom: insets.bottom + 16,
                    paddingTop: 8,
                    maxHeight: windowH * 0.92,
                    ...(sheetHeight != null ? { height: sheetHeight } : null),
                  },
                  animatedStyle,
                ]}
                className={cn(
                  "rounded-t-3xl border-t border-border bg-card px-4",
                  className,
                )}
              >
                <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-muted" />
                <View className="flex-1">{children}</View>
                {footer ? (
                  <View className="border-t border-border bg-card pt-3">
                    {footer}
                  </View>
                ) : null}
              </Animated.View>
            </GestureDetector>
          </Pressable>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

type SheetScrollViewProps = ComponentProps<typeof ScrollView>;

export function SheetScrollView({
  className,
  contentContainerStyle,
  ...props
}: SheetScrollViewProps) {
  return (
    <ScrollView
      {...props}
      className={cn(className)}
      contentContainerStyle={contentContainerStyle}
    />
  );
}
