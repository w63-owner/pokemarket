import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";

let installed = false;
let appStateSub: { remove: () => void } | null = null;
let netInfoUnsub: (() => void) | null = null;

/**
 * Wire React Query's `focusManager` to the React Native `AppState` API
 * (so a background → foreground transition triggers `refetchOnFocus`)
 * and its `onlineManager` to `@react-native-community/netinfo` (so
 * queries pause while offline and resume the moment we regain a usable
 * network instead of failing fast and forcing a manual pull-to-refresh).
 *
 * Idempotent — safe to call multiple times across HMR. Returns a
 * teardown function for tests; production fires this once at module
 * init and never resets.
 */
export function setupQueryManagers(): () => void {
  if (installed) {
    return () => teardownQueryManagers();
  }
  installed = true;

  // ── focusManager ────────────────────────────────────────────────────────
  // Seed focusManager with the current state to avoid a stale "blurred"
  // assumption on cold start (RN's default is "active", but we want to
  // be explicit so the very first refetch-on-foreground works).
  focusManager.setFocused(AppState.currentState === "active");

  appStateSub = AppState.addEventListener(
    "change",
    (status: AppStateStatus) => {
      focusManager.setFocused(status === "active");
    },
  );

  // ── onlineManager ───────────────────────────────────────────────────────
  // NetInfo exposes both `isConnected` (link layer) and
  // `isInternetReachable` (DNS/HTTP reachability). We treat the union as
  // "online" so queries don't permanently pause on captive-portal Wi-Fi.
  onlineManager.setEventListener((setOnline) => {
    const unsub = NetInfo.addEventListener((state) => {
      const reachable = state.isInternetReachable;
      const connected = state.isConnected;
      // `isInternetReachable` is `null` while NetInfo determines it —
      // fall back to `isConnected` so we don't flip offline during the
      // first ~500 ms of cold start.
      setOnline(reachable ?? !!connected);
    });
    netInfoUnsub = unsub;
    return unsub;
  });

  return () => teardownQueryManagers();
}

function teardownQueryManagers() {
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
  if (netInfoUnsub) {
    netInfoUnsub();
    netInfoUnsub = null;
  }
  installed = false;
}
