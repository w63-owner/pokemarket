import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@pokemarket/shared";
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
