import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { router } from "expo-router";

import { api, apiFetch } from "@/lib/api/client";

/**
 * Per-app notification handler — runs in foreground, decides whether to
 * surface the OS-level alert. We always show alerts and play the default
 * sound; tapping the alert is then routed by `setupNotificationListeners`.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type RegisterPushResult =
  | { ok: true; token: string }
  | { ok: false; reason: "denied" | "unsupported" | "error"; message?: string };

/**
 * Resolves the Expo `projectId` configured in `app.json` (`extra.eas.projectId`).
 * Without it, `getExpoPushTokenAsync` cannot mint a token.
 */
function resolveProjectId(): string | null {
  const fromExpoConfig =
    Constants.expoConfig?.extra?.eas?.projectId ??
    // SDK 50+ also exposes `easConfig`
    (Constants as unknown as {
      easConfig?: { projectId?: string };
    }).easConfig?.projectId;
  if (fromExpoConfig && fromExpoConfig !== "TODO_SET_AFTER_EAS_INIT") {
    return fromExpoConfig;
  }
  return null;
}

async function ensurePermissions(): Promise<"granted" | "denied"> {
  const { status: current } = await Notifications.getPermissionsAsync();
  if (current === "granted") return "granted";

  const { status: next } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return next === "granted" ? "granted" : "denied";
}

/**
 * Android requires explicit notification channels for sound, vibration and
 * importance to behave well. Set up a default + a high-priority "messages"
 * channel that the backend can target via `data.channelId` later.
 */
async function ensureAndroidChannels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Général",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#E63946",
  });
  await Notifications.setNotificationChannelAsync("messages", {
    name: "Messages",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#E63946",
  });
}

/**
 * Mint an Expo push token, persist it on the backend so the API can target
 * this device, and return it. Idempotent — safe to call on every cold start.
 */
export async function registerPushToken(): Promise<RegisterPushResult> {
  // Expo Go SDK 53+ no longer supports remote push (Apple removed it). Skip
  // gracefully so the dev experience doesn't surface confusing errors.
  if (Constants.appOwnership === "expo") {
    return { ok: false, reason: "unsupported", message: "Expo Go" };
  }

  const permission = await ensurePermissions();
  if (permission !== "granted") {
    return { ok: false, reason: "denied" };
  }

  await ensureAndroidChannels();

  const projectId = resolveProjectId();
  if (!projectId) {
    return {
      ok: false,
      reason: "error",
      message: "EAS projectId missing in app.json (extra.eas.projectId)",
    };
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;

    await api.post("/api/push/expo-tokens", {
      token,
      platform: Platform.OS === "ios" ? "ios" : "android",
      app_version: Constants.expoConfig?.version ?? null,
    });

    return { ok: true, token };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (__DEV__) console.warn("[notifications] register failed:", message);
    return { ok: false, reason: "error", message };
  }
}

/**
 * Best-effort backend cleanup — invoked when the user signs out or disables
 * notifications. Silently swallows network errors so logout never blocks.
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    const projectId = resolveProjectId();
    if (!projectId) return;
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    await apiFetch("/api/push/expo-tokens", {
      method: "DELETE",
      body: { token: tokenResponse.data },
    });
  } catch {
    // ignored — token might not exist or device might be offline
  }
}

export type NotificationPayload = {
  url?: string;
  conversationId?: string;
  listingId?: string;
  transactionId?: string;
};

/**
 * Convert a tapped notification into an in-app `router.push(...)`. The
 * backend always sets `data.url` to a relative path (e.g. `/messages/<id>`)
 * which we map to the matching Expo Router route.
 */
function navigateForNotification(data: NotificationPayload | undefined) {
  if (!data) return;

  // Prefer the explicit URL — backend already mirrors web routes that exist
  // on mobile (e.g. /messages/<id> ⇒ /inbox/<id>, /listing/<id>, etc.).
  const raw = data.url;
  if (raw) {
    const path = raw.startsWith("http") ? new URL(raw).pathname : raw;

    // Backend was written for the web app, so messages live under
    // `/messages/<id>` while mobile uses `/inbox/<id>`.
    const rewritten = path.replace(/^\/messages\//, "/inbox/");
    router.push(rewritten as never);
    return;
  }

  if (data.conversationId) {
    router.push(`/inbox/${data.conversationId}` as never);
    return;
  }
  if (data.transactionId) {
    router.push(`/profile/sales/${data.transactionId}` as never);
    return;
  }
  if (data.listingId) {
    router.push(`/listing/${data.listingId}` as never);
  }
}

/**
 * Wire push tap + foreground deep-link handlers. Returns a cleanup that
 * unsubscribes everything. Call once from the root layout.
 */
export function setupNotificationListeners(): () => void {
  // Cold start: app launched by tapping a notification.
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      const data = response.notification.request.content.data as
        | NotificationPayload
        | undefined;
      navigateForNotification(data);
    }
  });

  // Warm: user taps a notification while the app is open or backgrounded.
  const responseSub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as
        | NotificationPayload
        | undefined;
      navigateForNotification(data);
    },
  );

  // Universal Links / custom scheme arriving outside of a notification
  // (e.g. shared link, KYC return). Mirrors the same routing logic.
  const linkingSub = Linking.addEventListener("url", ({ url }) => {
    handleIncomingUrl(url);
  });

  // Cold start via deep link.
  Linking.getInitialURL().then((url) => {
    if (url) handleIncomingUrl(url);
  });

  return () => {
    responseSub.remove();
    linkingSub.remove();
  };
}

/**
 * Resolve a deep link or universal link to a router route. Exported because
 * a few screens (KYC return, OAuth callback) want to consume specific links
 * directly without going through the global router.
 */
export function handleIncomingUrl(url: string) {
  if (!url) return;

  let path: string;
  try {
    if (url.startsWith("http")) {
      // https://pokemarket.app/listing/123 → /listing/123
      const parsed = new URL(url);
      path = parsed.pathname + parsed.search;
    } else if (url.startsWith("pokemarket://")) {
      // Custom scheme: pokemarket://wallet/return → /wallet/return
      const stripped = url.slice("pokemarket://".length);
      path = "/" + stripped.replace(/^\/+/, "");
    } else {
      return;
    }
  } catch {
    return;
  }

  // Don't intercept links that already correspond to our own scheme returns
  // handled inline by callers (e.g. WebBrowser.openAuthSessionAsync resolves
  // to `pokemarket://wallet/return` synchronously — the wallet flow handles
  // that one without us pushing it on top of itself).
  if (path.startsWith("/stripe-redirect")) return;

  // Same web→mobile rewrite as for notifications.
  const rewritten = path.replace(/^\/messages\//, "/inbox/");
  router.push(rewritten as never);
}
