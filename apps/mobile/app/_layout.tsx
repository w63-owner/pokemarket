import "react-native-url-polyfill/auto";
import "../global.css";

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StripeProvider } from "@stripe/stripe-react-native";
import * as SplashScreen from "expo-splash-screen";
import Animated from "react-native-reanimated";
import { useColorScheme } from "nativewind";

import { initSentry, Sentry } from "@/lib/sentry";
import { env } from "@/lib/env";
import { ToastViewport } from "@/components/ui/toast";
import { useEffectiveTheme } from "@/lib/stores/theme";

// #region agent log
try {
  const g: any = globalThis as any;
  if (typeof g.__agentLog === "function") {
    g.__agentLog({
      location: "app/_layout.tsx:moduleEval",
      message: "ROOT_LAYOUT_MODULE_EVAL",
      hypothesisId: "H4,H5",
      data: {
        animatedTypeof: typeof Animated,
        animatedKeys: Animated
          ? Object.keys(Animated as object).slice(0, 30)
          : null,
        createAnimatedComponentType: typeof (Animated as any)
          ?.createAnimatedComponent,
        hasReactNativeWorklets: (() => {
          try {
            return !!require("react-native-worklets");
          } catch (e: any) {
            return "ERROR: " + e?.message;
          }
        })(),
      },
    });
  }
} catch {
  /* noop */
}
// #endregion

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

function RootLayout() {
  // #region agent log
  try {
    const g: any = globalThis as any;
    if (typeof g.__agentLog === "function") {
      g.__agentLog({
        location: "app/_layout.tsx:RootLayout",
        message: "ROOT_LAYOUT_RENDER",
        hypothesisId: "all",
        data: {},
      });
    }
  } catch {
    /* noop */
  }
  // #endregion

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const effectiveTheme = useEffectiveTheme();
  const { setColorScheme } = useColorScheme();
  useEffect(() => {
    setColorScheme(effectiveTheme);
  }, [effectiveTheme, setColorScheme]);

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
