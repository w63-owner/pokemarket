import type { PushNotificationRequest } from "@/types/api";

export function notifyUser(
  userId: string,
  title: string,
  body: string,
  url?: string,
) {
  const payload: PushNotificationRequest = {
    user_id: userId,
    title,
    body,
    url,
  };

  fetch("/api/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => {
    console.warn("[notifyUser] Push notification request failed:", err);
  });
}
