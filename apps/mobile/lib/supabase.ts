import "react-native-url-polyfill/auto";
import { AppState, type AppStateStatus } from "react-native";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@deckdealr/shared";
import { env } from "./env";
import { secureStorage } from "./supabase/secure-storage";

export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: {
      // Persist the session in the platform keychain (iOS) /
      // EncryptedSharedPreferences (Android) instead of plain-text
      // AsyncStorage. See `lib/supabase/secure-storage.ts` for the
      // SecureStore ↔ AsyncStorage fallback strategy.
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  },
);

let authAutoRefreshInstalled = false;

/**
 * Supabase cannot use browser visibility events in React Native, so token
 * refresh must follow AppState explicitly. Without this, the UI can retain a
 * restored user while its access token expires in the background.
 */
export function setupAuthAutoRefresh(): void {
  if (authAutoRefreshInstalled) return;
  authAutoRefreshInstalled = true;

  const syncAutoRefresh = (status: AppStateStatus) => {
    if (status === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  };

  syncAutoRefresh(AppState.currentState);
  AppState.addEventListener("change", syncAutoRefresh);
}
