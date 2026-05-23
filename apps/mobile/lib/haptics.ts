import * as Haptics from "expo-haptics";

/**
 * Tiny wrapper around `expo-haptics`. The native module silently no-ops on
 * unsupported devices, but we still wrap each call so promise rejections
 * don't surface as unhandled errors in dev.
 */
function safe<T>(fn: () => Promise<T>): void {
  fn().catch(() => {});
}

export type HapticIntent =
  | "tap"
  | "select"
  | "confirm"
  | "success"
  | "warning"
  | "error";

/**
 * Central intent API (Sprint 10):
 *   tap — light press (buttons, carousel page)
 *   select — toggles, tabs, switches
 *   confirm — pay, accept/reject offer
 *   success / warning / error — notification-style outcomes
 */
export function haptic(intent: HapticIntent): void {
  switch (intent) {
    case "tap":
      return safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    case "select":
      return safe(() => Haptics.selectionAsync());
    case "confirm":
      return safe(() =>
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
      );
    case "success":
      return safe(() =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      );
    case "warning":
      return safe(() =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
      );
    case "error":
      return safe(() =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
      );
  }
}

/** Low-level presets — thin aliases on `haptic` for legacy call sites. */
export const haptics = {
  light: () => haptic("tap"),
  medium: () => haptic("confirm"),
  heavy: () =>
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () => haptic("success"),
  warning: () => haptic("warning"),
  error: () => haptic("error"),
  selection: () => haptic("select"),
};
