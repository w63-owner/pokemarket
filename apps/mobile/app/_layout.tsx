import "react-native-url-polyfill/auto";
import "../global.css";

import { useEffect } from "react";
import {
  useFonts as useExpoFonts,
  Inter_500Medium,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StripeProvider } from "@stripe/stripe-react-native";
import * as SplashScreen from "expo-splash-screen";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useColorScheme } from "nativewind";

import { initSentry, Sentry } from "@/lib/sentry";
import { env } from "@/lib/env";
import { ToastViewport } from "@/components/ui/toast";
import { AnimatedSplash } from "@/components/splash/animated-splash";
import { useEffectiveTheme } from "@/lib/stores/theme";
import { useAppFonts } from "@/lib/fonts";
import { initAuth, useAuth } from "@/hooks/use-auth";
import { useInboxChannel } from "@/hooks/use-inbox-channel";
import { queryClient } from "@/lib/query/client";
import { setupQueryManagers } from "@/lib/query/setup";
import { persistOptions } from "@/lib/query/persister";

initSentry();
SplashScreen.preventAutoHideAsync().catch(() => {});

// Kick off Supabase session restoration as early as possible so that by the
// time the user lands on (or navigates to) an auth-gated tab the cached
// auth state is already resolved — no flash of protected content.
initAuth();

// Wire React Query's `focusManager` + `onlineManager` once at module
// init — before the provider mounts — so cold-start refetches pick up
// the correct online/foreground state on the very first render.
setupQueryManagers();

function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();
  const { user } = useAuth();

  // Deferred font weights: loaded post-mount so they don't block the splash.
  // Falls back to the nearest critical weight while these load (imperceptible
  // for most users). GeistMono is only visible on order/sale detail screens.
  useExpoFonts({
    Inter_500Medium,
    Inter_700Bold,
    PlusJakartaSans_600SemiBold,
    GeistMono_400Regular,
  });

  // App-root realtime — single websocket powering the bottom-tab badge
  // and the conversations list, regardless of whether the user has
  // opened the inbox yet.
  useInboxChannel(user?.id ?? null);

  // Coordinate splash hiding with font loading so the first paint
  // always renders with the design system fonts (Inter + Plus Jakarta
  // Sans) and never the system fallback. We still hide the splash if
  // a font fails to load — we'd rather show degraded typography than
  // brick the app on a missing asset.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  const effectiveTheme = useEffectiveTheme();
  const { setColorScheme } = useColorScheme();
  useEffect(() => {
    setColorScheme(effectiveTheme);
  }, [effectiveTheme, setColorScheme]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* `KeyboardProvider` wires the native keyboard module that powers
          `KeyboardAvoidingView` / `KeyboardAwareScrollView` from
          `react-native-keyboard-controller`. Required for Android edge-to-edge
          (the legacy `react-native` `KeyboardAvoidingView` is a no-op when
          `behavior` isn't set, which left every form input hidden behind
          the keyboard on Android — see app.json `edgeToEdgeEnabled: true`). */}
      <KeyboardProvider>
        <SafeAreaProvider>
          <StripeProvider
            publishableKey={env.STRIPE_PUBLISHABLE_KEY ?? ""}
            merchantIdentifier="merchant.app.pokemarket"
          >
            <BottomSheetModalProvider>
              <StatusBar style={effectiveTheme === "dark" ? "light" : "dark"} />
              <Stack screenOptions={{ headerShown: false }} />
              <ToastViewport />
              {/* Mounted last so it floats above the navigator + every
                  modal until it self-dismisses (one-shot per install
                  via AsyncStorage flag). Costs nothing past first paint
                  thanks to its internal `phase === "done"` short-circuit. */}
              <AnimatedSplash />
            </BottomSheetModalProvider>
          </StripeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function PersistedRoot() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      <RootLayout />
    </PersistQueryClientProvider>
  );
}

export default Sentry.wrap(PersistedRoot);
