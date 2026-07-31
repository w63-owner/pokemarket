import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { queryKeys } from "@pokemarket/shared";
import { supabase } from "@/lib/supabase";
import { unregisterPushToken } from "@/lib/notifications";
import { disableBiometry } from "@/lib/biometry";
import { queryClient } from "@/lib/query/client";
import { persister } from "@/lib/query/persister";

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

// Module-level cache shared by every `useAuth()` caller. Without this each
// screen would mount with `loading: true` and briefly render its "logged-in"
// UI before flipping to the AuthRequired empty state — causing a visible
// flash of protected content (favorites grid, inbox, profile) when navigating
// to an auth-gated tab while signed out.
let cached: AuthState = {
  session: null,
  user: null,
  loading: true,
};

const listeners = new Set<(state: AuthState) => void>();
let initialized = false;
let initPromise: Promise<void> | null = null;

function emit() {
  for (const listener of listeners) listener(cached);
}

function setSession(session: Session | null) {
  const previousUserId = cached.user?.id ?? null;
  const nextUserId = session?.user.id ?? null;

  cached = {
    session,
    user: session?.user ?? null,
    loading: false,
  };
  emit();

  // A signed-out or cold-start profile query may have cached `null` as a
  // successful result in an older build. Mark it stale whenever a user
  // becomes available so the authenticated row is fetched immediately.
  if (nextUserId && nextUserId !== previousUserId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.profile.me() });
  }
}

/**
 * Synchronous read of the current Supabase user id from the in-memory
 * auth cache. Returns `null` if `initAuth()` has not yet resolved or the
 * user is signed out. Callers that need to wait for the first session
 * resolution should use `requireUserId()` from `@/lib/auth/current-user`
 * instead — that helper awaits the boot init promise.
 */
export function getCachedUserId(): string | null {
  return cached.user?.id ?? null;
}

/**
 * Promise that resolves once `initAuth()` has performed its first
 * `getSession()` call. Used by `requireUserId()` to bridge the brief
 * window between the very first render and the cache being warm.
 */
export function getAuthInitPromise(): Promise<void> {
  return initPromise ?? Promise.resolve();
}

export function initAuth() {
  if (initialized) return;
  initialized = true;

  initPromise = supabase.auth
    .getSession()
    .then(({ data }) => {
      setSession(data.session);
    })
    .catch(() => {
      // A storage/session restoration failure must not leave every protected
      // screen stuck in its loading state forever.
      setSession(null);
    });

  supabase.auth.onAuthStateChange((event, newSession) => {
    setSession(newSession);

    // Belt-and-suspenders: if the session vanishes for any reason
    // (token expired, refresh failed, signOut() bypassed), nuke the
    // React Query cache AND the persisted snapshot so we never replay
    // a previous user's data on the next launch.
    if (event === "SIGNED_OUT") {
      queryClient.clear();
      void persister.removeClient();
    }
  });
}

export function useAuth() {
  initAuth();
  const [state, setState] = useState<AuthState>(cached);

  useEffect(() => {
    // Sync with the latest cached value in case it changed between render
    // and the effect running (e.g. session resolved on a sibling component).
    if (
      state.session !== cached.session ||
      state.user !== cached.user ||
      state.loading !== cached.loading
    ) {
      setState(cached);
    }
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    session: state.session,
    user: state.user,
    loading: state.loading,
    isAuthenticated: !!state.session,
    signOut: async () => {
      // Drop the push token first so the device stops receiving notifications
      // intended for the old user; failures are silent so logout always works.
      await Promise.allSettled([unregisterPushToken(), disableBiometry()]);
      const result = await supabase.auth.signOut();
      // Wipe the in-memory React Query cache AND the persisted snapshot
      // in AsyncStorage so the next user that signs in on the same
      // device never sees the previous user's hydrated favorites,
      // inbox, profile, etc. `removeClient()` is needed because the
      // persister throttles writes by 1.5 s — if the user kills the
      // app before that window expires, `clear()` alone would leave
      // stale data on disk.
      queryClient.clear();
      void persister.removeClient();
      return result;
    },
  };
}
