import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
// Push services may use this contact to reach us if our notifications cause
// issues. Must be a real `mailto:` or `https://` URI (RFC 8292 §2.1).
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:noreply@example.com";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
// Optional access token for Expo Push (only needed if the Expo project has
// "Enhanced security for push notifications" turned on in EAS settings).
const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN;

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[sendPush] VAPID keys not set, skipping web push");
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

type ExpoPushTicket = {
  status?: "ok" | "error";
  message?: string;
  details?: { error?: string };
  id?: string;
};

type ExpoPushResponse = { data?: ExpoPushTicket[]; errors?: unknown[] };

async function sendExpoNotifications(
  tokens: { id: string; token: string }[],
  title: string,
  body: string,
  url?: string,
): Promise<{ staleIds: string[] }> {
  if (tokens.length === 0) return { staleIds: [] };

  // Expo strongly recommends batches of 100 max; we generally have far less.
  const messages = tokens.map((t) => ({
    to: t.token,
    title,
    body,
    sound: "default" as const,
    priority: "high" as const,
    // The mobile app reads `data.url` to navigate when the notification is tapped.
    data: url ? { url } : {},
  }));

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  if (EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${EXPO_ACCESS_TOKEN}`;

  let response: Response;
  try {
    response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.error("[sendPush] Expo HTTP failure:", err);
    return { staleIds: [] };
  }

  if (!response.ok) {
    console.error("[sendPush] Expo non-OK response:", response.status);
    return { staleIds: [] };
  }

  const json = (await response.json().catch(() => null)) as ExpoPushResponse | null;
  const tickets = json?.data ?? [];

  const staleIds: string[] = [];
  tickets.forEach((ticket, idx) => {
    const tokenRow = tokens[idx];
    if (!tokenRow) return;
    if (ticket.status !== "error") return;

    // "DeviceNotRegistered" means the push token is no longer valid. Drop it.
    // Other errors (MessageTooBig, InvalidCredentials, etc.) are ops issues
    // we just log so they show up in Sentry.
    const code = ticket.details?.error;
    if (code === "DeviceNotRegistered") {
      staleIds.push(tokenRow.id);
    } else {
      console.error(
        "[sendPush] Expo ticket error:",
        tokenRow.id,
        code,
        ticket.message,
      );
    }
  });

  return { staleIds };
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url?: string,
): Promise<void> {
  const admin = createAdminClient();

  const [webResult, expoResult] = await Promise.all([
    admin
      .from("push_subscriptions")
      .select("id, subscription")
      .eq("user_id", userId),
    admin
      .from("expo_push_tokens")
      .select("id, token")
      .eq("user_id", userId),
  ]);

  // Web push fan-out
  const webStaleIds: string[] = [];
  const webSubscriptions = webResult.data ?? [];
  if (webResult.error) {
    console.error("[sendPush] Failed to fetch web subscriptions:", webResult.error);
  } else if (webSubscriptions.length > 0 && ensureConfigured()) {
    const payload = JSON.stringify({ title, body, url });
    await Promise.allSettled(
      webSubscriptions.map(async (row) => {
        try {
          const sub = row.subscription as unknown as webpush.PushSubscription;
          await webpush.sendNotification(sub, payload);
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            webStaleIds.push(row.id);
          } else {
            console.error(
              "[sendPush] Failed to send to subscription:",
              row.id,
              err,
            );
          }
        }
      }),
    );
  }

  if (webStaleIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", webStaleIds);
  }

  // Expo (mobile) fan-out
  const expoTokens = expoResult.data ?? [];
  if (expoResult.error) {
    console.error("[sendPush] Failed to fetch expo tokens:", expoResult.error);
  } else if (expoTokens.length > 0) {
    const { staleIds } = await sendExpoNotifications(
      expoTokens,
      title,
      body,
      url,
    );
    if (staleIds.length > 0) {
      await admin.from("expo_push_tokens").delete().in("id", staleIds);
    }
  }
}
