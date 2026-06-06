import {
  Expo,
  type ExpoPushMessage,
  type ExpoPushTicket,
} from "expo-server-sdk";
import type { PushNotificationCategory } from "@pokemarket/shared";
import { createAdminClient } from "@/lib/supabase/admin";

export type SendExpoPushOptions = {
  category?: PushNotificationCategory;
  /**
   * Relative path (e.g. `/messages/<id>`) consumed by the mobile app's
   * `navigateForNotification` to deep-link on tap. Mirrors the web `url`.
   */
  url?: string;
};

// A single Expo client, reused across invocations. `accessToken` is optional —
// only required when the Expo project enabled "Enhanced Security for Push
// Notifications". We pass it through when present so prod can opt in.
let expoClient: Expo | null = null;

function getExpoClient(): Expo {
  if (!expoClient) {
    expoClient = new Expo({
      accessToken: process.env.EXPO_ACCESS_TOKEN,
    });
  }
  return expoClient;
}

/**
 * Send a push notification to every Expo (React Native / mobile) device the
 * user has registered. Mirrors `sendPushNotification` (web/VAPID) but targets
 * the `expo_push_tokens` table and Expo's push service.
 *
 * Best-effort: provider/transport errors are logged (never thrown) so callers
 * — including the notifications-outbox drain — treat mobile delivery as a soft
 * channel. Tokens Expo flags as `DeviceNotRegistered` are pruned so we stop
 * targeting uninstalled apps.
 */
export async function sendExpoPushNotification(
  userId: string,
  title: string,
  body: string,
  options?: SendExpoPushOptions,
): Promise<void> {
  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from("expo_push_tokens")
    .select("id, token")
    .eq("user_id", userId);

  if (error) {
    console.error("[sendExpoPush] Failed to fetch tokens:", error);
    return;
  }

  if (!rows || rows.length === 0) return;

  // Map token → row id so we can prune stale rows after inspecting tickets.
  const tokenToId = new Map<string, string>();
  const messages: ExpoPushMessage[] = [];

  for (const row of rows) {
    if (!Expo.isExpoPushToken(row.token)) {
      // Defensive: a malformed token slipped past the registration guard.
      console.warn("[sendExpoPush] Skipping invalid Expo token:", row.id);
      continue;
    }
    tokenToId.set(row.token, row.id);
    messages.push({
      to: row.token,
      title,
      body,
      sound: "default",
      // `channelId` lets Android route to the right importance channel
      // (see mobile `ensureAndroidChannels`). Messages use a high-priority
      // channel; everything else falls back to the default channel.
      channelId: options?.category === "messages" ? "messages" : "default",
      data: {
        ...(options?.url && { url: options.url }),
        ...(options?.category && { category: options.category }),
      },
    });
  }

  if (messages.length === 0) return;

  const expo = getExpoClient();
  const chunks = expo.chunkPushNotifications(messages);
  const tickets: ExpoPushTicket[] = [];

  for (const chunk of chunks) {
    try {
      const chunkTickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...chunkTickets);
    } catch (err) {
      console.error("[sendExpoPush] Failed to send chunk:", err);
    }
  }

  // Inspect tickets for tokens Expo rejected as unregistered and prune them.
  // Expo returns tickets in the same order as the messages we sent.
  const staleIds: string[] = [];
  tickets.forEach((ticket, index) => {
    if (ticket.status !== "error") return;
    const errorCode = ticket.details?.error;
    if (errorCode === "DeviceNotRegistered") {
      const token = messages[index]?.to;
      const id = typeof token === "string" ? tokenToId.get(token) : undefined;
      if (id) staleIds.push(id);
    } else {
      console.error("[sendExpoPush] Ticket error:", ticket.message, errorCode);
    }
  });

  if (staleIds.length > 0) {
    await admin.from("expo_push_tokens").delete().in("id", staleIds);
  }
}
