import { AccessibilityInfo } from "react-native";
import { create } from "zustand";

interface ReducedMotionState {
  reduceMotion: boolean;
}

/**
 * Global Zustand store for the OS-level "Reduce Motion" accessibility
 * setting. Registering a single `AccessibilityInfo` listener here
 * (instead of one per component) means the native bridge call fires
 * once regardless of how many components consume the value.
 */
export const useReducedMotionStore = create<ReducedMotionState>(() => ({
  reduceMotion: false,
}));

// Resolve the initial value asynchronously at module-init time so the
// store is accurate before the first component mounts (avoids a one-frame
// flash of motion that should be disabled).
AccessibilityInfo.isReduceMotionEnabled()
  .then((value) => useReducedMotionStore.setState({ reduceMotion: value }))
  .catch(() => {});

// Keep in sync with live OS preference changes (user toggles while app is open).
AccessibilityInfo.addEventListener("reduceMotionChanged", (value: boolean) => {
  useReducedMotionStore.setState({ reduceMotion: value });
});
