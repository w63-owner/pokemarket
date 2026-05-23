import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

/**
 * Scroll-aware tab bar coordination.
 *
 * The web version watches `window.scroll` from a single hook; on RN
 * each scrollable surface (FlashList, ScrollView, Animated.ScrollView)
 * needs its own scroll handler attached. We therefore expose:
 *
 *   1. A context that owns a single shared-value (`hidden`) read by the
 *      tab bar inside `app/(tabs)/_layout.tsx`.
 *   2. A `useTabBarScrollHandler()` hook that returns a callable
 *      `onScroll` to attach to a scroll surface. We intentionally use a
 *      plain JS handler (not `useAnimatedScrollHandler`): FlashList v2's
 *      RecyclerView calls `_c.call` on whatever is passed — Reanimated's
 *      animated scroll refs are not always real functions here (see Shopify
 *      flash-list#1720, Reanimated#9266), which crashed at runtime. Same
 *      hide logic applies; updating `hidden.value` from JS is fine for this UX.
 *
 * Hiding logic mirrors the web:
 *   - When the user scrolls down past `THRESHOLD_PX`, `hidden = 1`.
 *   - When they scroll up by ≥ `THRESHOLD_PX`, `hidden = 0`.
 *   - When `scrollY ≤ TOP_PX`, force `hidden = 0` to keep the tab bar
 *     visible at the top of any feed (avoids the "where did the tab
 *     bar go?" disorientation on hard reloads).
 */

const THRESHOLD_PX = 8;
const TOP_PX = 24;

export type TabBarScrollContextValue = {
  /**
   * UI-thread shared value, `0` = visible, `1` = hidden. Use
   * `useAnimatedStyle` to read it inside the tab bar.
   */
  hidden: SharedValue<number>;
  /**
   * Force-show the tab bar. Use when navigating to a new screen so the
   * new screen always starts with the tab bar visible regardless of
   * scroll state inherited from the previous screen.
   */
  show: () => void;
};

const TabBarScrollContext = createContext<TabBarScrollContextValue | null>(
  null,
);

export function useTabBarScroll(): TabBarScrollContextValue {
  const ctx = useContext(TabBarScrollContext);
  if (!ctx) {
    throw new Error(
      "useTabBarScroll must be used inside <TabBarScrollProvider>",
    );
  }
  return ctx;
}

/**
 * Returns an `onScroll` handler that toggles tab bar visibility. Attach to
 * `Animated.ScrollView`, `FlashList`, etc. (`onScroll={handler}` +
 * `scrollEventThrottle={16}` where supported).
 *
 * Optional `enabled = false` returns a no-op handler so screens can
 * opt out (e.g. message thread keeps the tab bar always-on).
 */
export function useTabBarScrollHandler(enabled: boolean = true) {
  const ctx = useContext(TabBarScrollContext);
  const hidden = ctx?.hidden;
  const lastY = useRef(0);

  return useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!hidden) return;
      const y = event.nativeEvent.contentOffset.y;
      const dy = y - lastY.current;

      if (!enabled) {
        hidden.value = 0;
        lastY.current = y;
        return;
      }

      if (y <= TOP_PX) {
        hidden.value = 0;
      } else if (dy > THRESHOLD_PX) {
        hidden.value = 1;
      } else if (dy < -THRESHOLD_PX) {
        hidden.value = 0;
      }

      lastY.current = y;
    },
    [enabled, hidden],
  );
}

/**
 * Provider mounted in `(tabs)/_layout.tsx`. Owns the shared value the
 * tab bar reads via `useAnimatedStyle`.
 */
export function useTabBarScrollState(): TabBarScrollContextValue {
  const hidden = useSharedValue(0);
  const show = useCallback(() => {
    hidden.value = 0;
  }, [hidden]);

  return useMemo(() => ({ hidden, show }), [hidden, show]);
}

export const TabBarScrollProvider = TabBarScrollContext.Provider;

/**
 * Tiny escape hatch to read the raw context without throwing — useful
 * for components that may render both inside and outside the tab
 * navigator (e.g. `SmartBackButton` on a transparent overlay header).
 */
export function useOptionalTabBarScroll(): TabBarScrollContextValue | null {
  return useContext(TabBarScrollContext);
}
