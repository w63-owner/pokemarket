import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { unregisterPushToken } from "@/lib/notifications";
import { disableBiometry } from "@/lib/biometry";

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

function emit() {
  for (const listener of listeners) listener(cached);
}

export function initAuth() {
  if (initialized) return;
  initialized = true;

  void supabase.auth.getSession().then(({ data }) => {
    cached = {
      session: data.session,
      user: data.session?.user ?? null,
      loading: false,
    };
    emit();
  });

  supabase.auth.onAuthStateChange((_event, newSession) => {
    cached = {
      session: newSession,
      user: newSession?.user ?? null,
      loading: false,
    };
    emit();
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
      return supabase.auth.signOut();
    },
  };
}
