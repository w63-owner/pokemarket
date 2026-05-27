import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * SecureStore-backed `Storage` adapter for `@supabase/supabase-js`.
 *
 * Why: AsyncStorage is plain unencrypted JSON on disk; storing the Supabase
 * JWT there means anyone with filesystem access (jailbroken device, lost
 * unlocked device, leaked backup) can lift the refresh_token and impersonate
 * the user indefinitely. `expo-secure-store` wraps Keychain (iOS) and the
 * EncryptedSharedPreferences / Keystore (Android) which is the recommended
 * vault for short auth secrets.
 *
 * Constraints we have to design around:
 *   1. Android Keystore-backed values have a ~2 KB hard limit per entry. A
 *      bare Supabase access_token + refresh_token JSON blob runs ~1.5 KB but
 *      can exceed the limit if claims grow. We fall back to AsyncStorage for
 *      over-sized values rather than crashing the session.
 *   2. Pre-existing users have their session in AsyncStorage. We must migrate
 *      transparently on first read so they don't get logged out on update.
 *   3. SecureStore on web is unavailable; this adapter is RN-only — keep it
 *      under `apps/mobile/lib/`.
 */

// Slightly below the Android 2048-byte limit; gives us headroom for the
// Keystore overhead and key/value framing. Chosen empirically; documented
// in expo-secure-store's source as "≈2048 bytes".
const SECURE_STORE_MAX_BYTES = 1800;

// A side-channel marker we write to AsyncStorage when a value was too large
// for SecureStore on Android. Read-path checks AsyncStorage when SecureStore
// returns null so the marker isn't strictly required, but keeping it makes
// debugging in dev logs trivial.
const OVERSIZED_PREFIX = "pokemarket.secure-storage.oversized:";

function byteLength(value: string): number {
  // Hermes ships a Buffer polyfill via `Buffer.from(value).length` but it's
  // not always available. `TextEncoder` is on iOS/Android since Hermes 0.12
  // and we already import `react-native-url-polyfill/auto` which installs a
  // fallback if absent.
  return typeof TextEncoder !== "undefined"
    ? new TextEncoder().encode(value).length
    : // Worst-case approximation: 4 bytes per UTF-16 code unit.
      value.length * 4;
}

async function migrateFromAsyncStorage(key: string): Promise<string | null> {
  // If a previous build wrote the session to AsyncStorage, move it into
  // SecureStore (or keep it in AsyncStorage if it would not fit) and clean
  // up the legacy entry so we don't drift between two stores.
  const legacy = await AsyncStorage.getItem(key);
  if (legacy === null) return null;

  try {
    if (
      Platform.OS === "android" &&
      byteLength(legacy) > SECURE_STORE_MAX_BYTES
    ) {
      await AsyncStorage.setItem(OVERSIZED_PREFIX + key, "1");
    } else {
      await SecureStore.setItemAsync(key, legacy, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      await AsyncStorage.removeItem(key);
    }
  } catch (err) {
    if (__DEV__) {
      console.warn("[supabase/secure-storage] migration failed for", key, err);
    }
  }

  return legacy;
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const fromSecure = await SecureStore.getItemAsync(key);
      if (fromSecure !== null) return fromSecure;
    } catch (err) {
      if (__DEV__) {
        console.warn("[supabase/secure-storage] getItem failed:", err);
      }
    }

    // Either SecureStore returned null (cold device, oversized value on
    // Android) or the read errored. Fall back to AsyncStorage which doubles
    // as the migration source for legacy sessions.
    return migrateFromAsyncStorage(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    const bytes = byteLength(value);

    // On Android, pre-empt the 2 KB cap so we don't lose the session at the
    // worst possible moment (right after refresh, with no recovery path).
    if (Platform.OS === "android" && bytes > SECURE_STORE_MAX_BYTES) {
      await AsyncStorage.setItem(key, value);
      await AsyncStorage.setItem(OVERSIZED_PREFIX + key, "1");
      // Best-effort: clear any stale SecureStore copy from before the value
      // crossed the size threshold.
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        // ignore — nothing to clean up
      }
      return;
    }

    try {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      // Wipe any prior AsyncStorage shadow (post-migration, post-oversize).
      await AsyncStorage.multiRemove([key, OVERSIZED_PREFIX + key]);
    } catch (err) {
      if (__DEV__) {
        console.warn(
          "[supabase/secure-storage] setItem failed, falling back to AsyncStorage:",
          err,
        );
      }
      await AsyncStorage.setItem(key, value);
      await AsyncStorage.setItem(OVERSIZED_PREFIX + key, "1");
    }
  },

  async removeItem(key: string): Promise<void> {
    await Promise.allSettled([
      SecureStore.deleteItemAsync(key),
      AsyncStorage.removeItem(key),
      AsyncStorage.removeItem(OVERSIZED_PREFIX + key),
    ]);
  },
};
