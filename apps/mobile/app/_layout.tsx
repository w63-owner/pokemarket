import "react-native-url-polyfill/auto";
import "../global.css";

import { useEffect } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StripeProvider } from "@stripe/stripe-react-native";
import * as SplashScreen from "expo-splash-screen";
import { colorScheme as nwColorScheme } from "nativewind";

import { initSentry, Sentry } from "@/lib/sentry";
import { env } from "@/lib/env";
import { ToastViewport } from "@/components/ui/toast";
import {
  registerPushToken,
  setupNotificationListeners,
} from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import { useEffectiveTheme, useThemeStore } from "@/lib/stores/theme";

initSentry();
SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Re-attempt push registration each time the user signs in or comes back
 * to the app. Idempotent on the backend (UPSERT on (user_id, token)).
 */
function tryRegisterPushIfAuthenticated() {
  supabase.auth
    .getSession()
    .then(({ data }) => {
      if (data.session?.user) registerPushToken();
    })
    .catch(() => {});
}

function RootLayout() {
  // Mirror the user's persisted theme preference into NativeWind so all
  // `dark:` utility classes resolve correctly. We push the *effective*
  // scheme so `system` follows the OS via the Appearance listener in
  // `lib/stores/theme.ts`.
  const effectiveTheme = useEffectiveTheme();
  const preference = useThemeStore((s) => s.preference);

  useEffect(() => {
    nwColorScheme.set(preference);
  }, [preference]);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    const cleanupNotifications = setupNotificationListeners();
    tryRegisterPushIfAuthenticated();

    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        tryRegisterPushIfAuthenticated();
      }
    });

    // When the app returns to the foreground, re-check token validity. Some
    // OS-level changes (user toggled notifications in Settings) only become
    // visible after a permissions check.
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") tryRegisterPushIfAuthenticated();
    });

    return () => {
      cleanupNotifications();
      authSub.subscription.unsubscribe();
      appStateSub.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StripeProvider
            publishableKey={env.STRIPE_PUBLISHABLE_KEY ?? ""}
            merchantIdentifier="merchant.app.pokemarket"
          >
            <StatusBar style={effectiveTheme === "dark" ? "light" : "dark"} />
            <Stack screenOptions={{ headerShown: false }} />
            <ToastViewport />
          </StripeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
