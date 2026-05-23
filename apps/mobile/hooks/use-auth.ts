import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { unregisterPushToken } from "@/lib/notifications";
import { disableBiometry } from "@/lib/biometry";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
      },
    );

    return () => subscription.subscription.unsubscribe();
  }, []);

  return {
    session,
    user,
    loading,
    isAuthenticated: !!session,
    signOut: async () => {
      // Drop the push token first so the device stops receiving notifications
      // intended for the old user; failures are silent so logout always works.
      await Promise.allSettled([unregisterPushToken(), disableBiometry()]);
      return supabase.auth.signOut();
    },
  };
}
