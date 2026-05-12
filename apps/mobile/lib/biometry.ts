import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

const SECURE_KEY = "pokemarket.biometric.session";
const PREF_KEY = "pokemarket.biometric.enabled";

type StoredSession = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  saved_at: number;
};

export type BiometryCapability = {
  hasHardware: boolean;
  isEnrolled: boolean;
  // Localized name to show in the UI ("Face ID", "Touch ID", "Empreinte").
  label: string;
};

/**
 * Probe device for biometric capabilities. Cached at the OS level so this is
 * cheap to call; safe to run on every render of the login screen.
 */
export async function getBiometryCapability(): Promise<BiometryCapability> {
  const [hasHardware, isEnrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  const hasFace = types.includes(
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  );
  const hasFingerprint = types.includes(
    LocalAuthentication.AuthenticationType.FINGERPRINT,
  );

  let label = "Biométrie";
  if (Platform.OS === "ios") {
    label = hasFace ? "Face ID" : hasFingerprint ? "Touch ID" : "Biométrie";
  } else {
    label = hasFingerprint
      ? "Empreinte"
      : hasFace
        ? "Reconnaissance faciale"
        : "Biométrie";
  }

  return { hasHardware, isEnrolled, label };
}

/**
 * Whether the user previously enabled biometric login. Stored as a flag so
 * we can show the "Se connecter avec Face ID" button without first prompting
 * the OS dialog (which would be jarring on cold start).
 */
export async function isBiometryEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(PREF_KEY)) === "1";
  } catch {
    return false;
  }
}

/**
 * Persist the current Supabase session in the device keychain, gated by a
 * one-time biometric check. Subsequent logins can be unlocked without the
 * password.
 */
export async function enableBiometryForCurrentSession(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const capability = await getBiometryCapability();
  if (!capability.hasHardware) {
    return { ok: false, reason: "Pas de matériel biométrique sur cet appareil." };
  }
  if (!capability.isEnrolled) {
    return {
      ok: false,
      reason: "Aucune empreinte / visage enregistré dans les réglages.",
    };
  }

  const auth = await LocalAuthentication.authenticateAsync({
    promptMessage: `Confirmer avec ${capability.label}`,
    fallbackLabel: "Annuler",
    disableDeviceFallback: true,
  });
  if (!auth.success) {
    return { ok: false, reason: "Authentification annulée." };
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    return { ok: false, reason: "Aucune session active à mémoriser." };
  }

  const stored: StoredSession = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user_id: data.session.user.id,
    saved_at: Date.now(),
  };

  await SecureStore.setItemAsync(SECURE_KEY, JSON.stringify(stored), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: false,
  });
  await SecureStore.setItemAsync(PREF_KEY, "1");
  return { ok: true };
}

/**
 * Forget the persisted session. Called on explicit disable from the profile,
 * and on signOut to avoid a silent re-login attempt with a stale token.
 */
export async function disableBiometry(): Promise<void> {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(SECURE_KEY),
    SecureStore.deleteItemAsync(PREF_KEY),
  ]);
}

export type UnlockResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "no-session" | "biometry-failed" | "refresh-failed"; message?: string };

/**
 * Prompt for biometric authentication and, on success, restore the saved
 * Supabase session into the in-memory client. Refresh tokens are rotated
 * server-side, so we both `setSession` and trigger a `refreshSession` to
 * make sure subsequent API calls use a fresh access token.
 */
export async function unlockWithBiometry(): Promise<UnlockResult> {
  if (!(await isBiometryEnabled())) {
    return { ok: false, reason: "no-session" };
  }
  const capability = await getBiometryCapability();
  if (!capability.hasHardware || !capability.isEnrolled) {
    return { ok: false, reason: "biometry-failed", message: "Biométrie indisponible." };
  }

  const auth = await LocalAuthentication.authenticateAsync({
    promptMessage: `Se connecter avec ${capability.label}`,
    fallbackLabel: "Utiliser le mot de passe",
    disableDeviceFallback: true,
  });
  if (!auth.success) {
    return { ok: false, reason: "biometry-failed" };
  }

  const raw = await SecureStore.getItemAsync(SECURE_KEY);
  if (!raw) return { ok: false, reason: "no-session" };

  let stored: StoredSession;
  try {
    stored = JSON.parse(raw) as StoredSession;
  } catch {
    await disableBiometry();
    return { ok: false, reason: "no-session" };
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
  });
  if (error || !data.session) {
    // Refresh token expired — wipe and fall back to password login.
    await disableBiometry();
    return {
      ok: false,
      reason: "refresh-failed",
      message: "Session expirée, reconnecte-toi avec ton mot de passe.",
    };
  }

  // Persist the rotated tokens so the next biometric unlock keeps working.
  const refreshed: StoredSession = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user_id: data.session.user.id,
    saved_at: Date.now(),
  };
  await SecureStore.setItemAsync(SECURE_KEY, JSON.stringify(refreshed), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

  return { ok: true, userId: data.session.user.id };
}
