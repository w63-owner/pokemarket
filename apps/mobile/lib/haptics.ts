import * as Haptics from "expo-haptics";

/**
 * Tiny wrapper around `expo-haptics`. The native module silently no-ops on
 * unsupported devices, but we still wrap each call so promise rejections
 * don't surface as unhandled errors in dev.
 */
function safe<T>(fn: () => Promise<T>): void {
  fn().catch(() => {});
}

export const haptics = {
  /** Subtle pop — favorites, like, send message, button press confirm. */
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Medium tap — primary CTA confirmation, navigation reveal. */
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Heavy thump — high-stakes confirmation (payment, ship, dispute). */
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** Double-tap "success" pattern (Apple Pay-style). */
  success: () =>
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Sharp warning rhythm — toasts on retryable failure. */
  warning: () =>
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Buzz on hard failure (payment declined, etc.). */
  error: () =>
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** Wheel-style detent during slider/picker interactions. */
  selection: () => safe(() => Haptics.selectionAsync()),
};
