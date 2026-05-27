import "react-native-url-polyfill/auto";
import "../global.css";

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { initAuth } from "@/hooks/use-auth";
import { setupNotificationListeners } from "@/lib/notifications";

initSentry();
SplashScreen.preventAutoHideAsync().catch(() => {});

// Kick off Supabase session restoration as early as possible so that by the
// time the user lands on (or navigates to) an auth-gated tab the cached
// auth state is already resolved — no flash of protected content.
initAuth();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();

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

  // Subscribe to push notification taps + universal links once, at the root.
  // The listener resolves cold-start notifications (app launched by tap) AND
  // warm taps (app already running). Cleanup is mandatory because Expo
  // Notifications keeps the subscription alive across Fast Refresh otherwise.
  useEffect(() => {
    const cleanup = setupNotificationListeners();
    return cleanup;
  }, []);

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
          <QueryClientProvider client={queryClient}>
            <StripeProvider
              publishableKey={env.STRIPE_PUBLISHABLE_KEY ?? ""}
              merchantIdentifier="merchant.app.pokemarket"
            >
              <BottomSheetModalProvider>
                <StatusBar
                  style={effectiveTheme === "dark" ? "light" : "dark"}
                />
                <Stack screenOptions={{ headerShown: false }} />
                <ToastViewport />
                {/* Mounted last so it floats above the navigator + every
                    modal until it self-dismisses (one-shot per install
                    via AsyncStorage flag). Costs nothing past first paint
                    thanks to its internal `phase === "done"` short-circuit. */}
                <AnimatedSplash />
              </BottomSheetModalProvider>
            </StripeProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
