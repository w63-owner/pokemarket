import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";

import { Text } from "@/components/ui";
import { getOnboardingUrl } from "@/lib/api/wallet";
import { useThemeColors } from "@/lib/theme-colors";

export default function StripeConnectRefreshScreen() {
  const colors = useThemeColors();

  useEffect(() => {
    let cancelled = false;

    async function renew() {
      try {
        const url = await getOnboardingUrl();
        if (cancelled) return;
        await WebBrowser.openAuthSessionAsync(
          url,
          "pokemarket://wallet/return",
        );
        if (!cancelled) router.replace("/wallet/return");
      } catch {
        if (!cancelled) router.replace("/wallet");
      }
    }

    void renew();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Stack.Screen options={{ headerShown: false }} />
      <ActivityIndicator size="large" color={colors.primary} />
      <Text variant="h3" className="mt-5 text-center">
        Renouvellement du lien Stripe…
      </Text>
    </View>
  );
}
