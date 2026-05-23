import type { Database, PushNotificationCategory } from "@pokemarket/shared";

import { supabase } from "@/lib/supabase";

export type NotificationPrefCategory = PushNotificationCategory;

const DEFAULT_PREFS: Record<NotificationPrefCategory, boolean> = {
  commerce: true,
  messages: true,
  offers: true,
  saved_searches: true,
  following: true,
};

function mergeDefaults(
  rows:
    | Pick<
        Database["public"]["Tables"]["notification_preferences"]["Row"],
        "category" | "enabled"
      >[]
    | null,
): Record<NotificationPrefCategory, boolean> {
  const next = { ...DEFAULT_PREFS };
  for (const row of rows ?? []) {
    if (row.category in next) {
      next[row.category as NotificationPrefCategory] = row.enabled;
    }
  }
  return next;
}

export async function fetchNotificationPreferences(): Promise<
  Record<NotificationPrefCategory, boolean>
> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.user) {
    throw new Error("Non authentifié");
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("category, enabled")
    .eq("user_id", session.user.id);

  if (error) throw error;
  return mergeDefaults(data ?? []);
}

export async function upsertNotificationPreference(opts: {
  category: NotificationPrefCategory;
  enabled: boolean;
}): Promise<void> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = session?.user?.id;
  if (!userId) throw new Error("Non authentifié");

  const now = new Date().toISOString();
  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: userId,
      category: opts.category,
      enabled: opts.enabled,
      updated_at: now,
    },
    { onConflict: "user_id,category" },
  );

  if (error) throw error;
}
