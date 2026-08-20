import { useEffect, useRef } from "react";
import Constants from "expo-constants";

import { registerPushToken } from "@/lib/notifications";
import { useAuth } from "./use-auth";

/**
 * Auto-register push notifications when the user is authenticated.
 * Runs once per authenticated user id (not on every render or route change)
 * to avoid spamming the permission prompt. Re-runs after an in-session
 * account switch so the backend token row tracks the active user.
 * Silently fails if:
 * - Running in Expo Go (push not supported)
 * - User denied permissions (they can re-enable in settings)
 * - Device offline or backend unreachable
 *
 * This hook does NOT show any UI — the user can still manage preferences
 * manually via `/profile/notifications` if they want to disable categories
 * or re-enable after denial.
 */
export function usePushRegistration() {
  const { user } = useAuth();
  const attemptedForUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      // Allow the next sign-in in this JS session to register again.
      attemptedForUserIdRef.current = null;
      return;
    }

    // Only attempt once per user id per session.
    if (attemptedForUserIdRef.current === user.id) return;

    // Skip Expo Go entirely — no point trying to register (it will fail).
    if (Constants.appOwnership === "expo") return;

    attemptedForUserIdRef.current = user.id;

    // Fire-and-forget: register in the background without blocking the UI.
    // We intentionally don't await or show loading state — if it fails,
    // the user can still manually enable it later from settings.
    registerPushToken()
      .then((result) => {
        if (__DEV__ && !result.ok) {
          console.info("[push] auto-registration skipped:", result.reason);
        }
      })
      .catch((err) => {
        // Swallow errors — we don't want a network blip to break cold start.
        if (__DEV__) {
          console.warn("[push] auto-registration failed:", err);
        }
      });
  }, [user]);
}
