import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = "mailto:noreply@pokemarket.app";

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

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url?: string,
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

  const payload = JSON.stringify({ title, body, url });
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
