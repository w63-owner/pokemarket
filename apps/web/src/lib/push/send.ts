import webpush from "web-push";
import * as Sentry from "@sentry/nextjs";
import {
  sanitizePushDeepLink,
  type PushNotificationCategory,
} from "@pokemarket/shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendExpoPushNotification } from "@/lib/push/expo";

export type SendPushOptions = {
  category?: PushNotificationCategory;
  conversationId?: string;
};

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
// Push services may use this contact to reach us if our notifications cause
// issues. Must be a real `mailto:` or `https://` URI (RFC 8292 §2.1).
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:noreply@example.com";

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[sendPush] VAPID keys not set, skipping push notification");
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

/**
 * Deliver a push notification to every device the user owns — web (PWA via
 * VAPID/web-push) AND mobile (React Native via Expo). Each transport is
 * best-effort and isolated: a failure in one never blocks the other, so a
 * single call from a webhook/Server Action fans out to all platforms.
 */
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url?: string,
  options?: SendPushOptions,
): Promise<void> {
  if (
    options?.category &&
    !(await isNotificationCategoryEnabled(userId, options.category))
  ) {
    return;
  }
  if (
    options?.category === "messages" &&
    options.conversationId &&
    !(await isConversationNotificationEnabled(userId, options.conversationId))
  ) {
    return;
  }

  // Defense in depth: never forward absolute/external deep links to web or
  // mobile clients, even from trusted server call sites.
  const safeUrl = sanitizePushDeepLink(url);

  await Promise.allSettled([
    sendWebPush(userId, title, body, safeUrl, options),
    sendExpoPushNotification(userId, title, body, {
      category: options?.category,
      url: safeUrl,
    }),
  ]);
}

async function isConversationNotificationEnabled(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("conversation_participant_settings")
    .select("muted_until")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (error) {
    Sentry.captureException(error, {
      tags: {
        component: "push",
        operation: "load-conversation-notification-preference",
      },
    });
    return false;
  }

  return (
    !data?.muted_until || new Date(data.muted_until).getTime() <= Date.now()
  );
}

async function isNotificationCategoryEnabled(
  userId: string,
  category: PushNotificationCategory,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notification_preferences")
    .select("enabled")
    .eq("user_id", userId)
    .eq("category", category)
    .maybeSingle();

  if (error) {
    Sentry.captureException(error, {
      tags: {
        component: "push",
        operation: "load-notification-preference",
        category,
      },
    });
    return false;
  }

  return data?.enabled !== false;
}

async function sendWebPush(
  userId: string,
  title: string,
  body: string,
  url?: string,
  options?: SendPushOptions,
): Promise<void> {
  if (!ensureConfigured()) return;

  const admin = createAdminClient();

  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("id, subscription")
    .eq("user_id", userId);

  if (error) {
    console.error("[sendPush] Failed to fetch subscriptions:", error);
    return;
  }

  if (!subscriptions || subscriptions.length === 0) return;

  const payload = JSON.stringify({
    title,
    body,
    url,
    ...(options?.category && { category: options.category }),
  });
  const staleIds: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (row) => {
      try {
        const sub = row.subscription as unknown as webpush.PushSubscription;
        await webpush.sendNotification(sub, payload);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(row.id);
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

  if (staleIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", staleIds);
  }
}
