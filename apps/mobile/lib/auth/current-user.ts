import { getAuthInitPromise, getCachedUserId } from "@/hooks/use-auth";

/**
 * Synchronous read of the current Supabase user id from the in-memory
 * auth cache populated by `initAuth()`. Returns `null` when the user is
 * signed out OR when the very first `getSession()` round-trip is still
 * in flight (which only happens for ~1 frame on cold boot before any
 * authenticated screen mounts).
 *
 * Use this everywhere you previously did:
 *   `const { data: { user } } = await supabase.auth.getUser()`
 * to skip the ~50–250 ms network round-trip Supabase performs on every
 * `getUser()` call. The cache is kept in sync by the `onAuthStateChange`
 * subscription set up in `hooks/use-auth.ts:initAuth()`.
 */
export function getCurrentUserId(): string | null {
  return getCachedUserId();
}

/**
 * Same as `getCurrentUserId()` but throws when the user is not signed
 * in. Awaits the initial `getSession()` once if it hasn't resolved yet
 * — necessary because the very first action on a freshly-launched app
 * may run before the auth cache is warm. Subsequent calls are O(1).
 *
 * Replace `await supabase.auth.getUser() → if (!user) throw …` with:
 *   `const userId = await requireUserId()`
 */
export async function requireUserId(): Promise<string> {
  let userId = getCachedUserId();
  if (userId) return userId;

  // The cache may not yet be populated on the very first call after
  // cold boot. Await the boot init once, then re-check.
  await getAuthInitPromise();
  userId = getCachedUserId();
  if (!userId) throw new Error("Non authentifié");

  return userId;
}
