import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { MotiView } from "moti";
import { AlertTriangle, CheckCircle2 } from "lucide-react-native";
import { queryKeys, type KycStatus } from "@pokemarket/shared";

import { fetchStripeConnectStatus } from "@/lib/api/wallet";
import { stripeConnectStatusKey } from "@/hooks/use-wallet";
import { Button, Text } from "@/components/ui";
import { spring } from "@/lib/motion";
import { useThemeColors } from "@/lib/theme-colors";

type Phase = "checking" | "success" | "error";

/**
 * Reached after Stripe Connect onboarding closes the in-app browser via
 * the `pokemarket://wallet/return` deep link. Refreshes the cached KYC
 * status, primes React Query so `/wallet` shows the new state instantly,
 * then bounces back after 2.5s.
 */
export default function WalletReturnScreen() {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("checking");
  const [kycStatus, setKycStatus] = useState<KycStatus>("PENDING");
  const colors = useThemeColors();

  useEffect(() => {
    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    async function check() {
      try {
        const status = await fetchStripeConnectStatus();
        if (cancelled) return;

        setKycStatus(status.kyc_status);
        setPhase("success");

        // Hydrate the wallet screen's caches so when we navigate back
        // there's no second loading flicker. The balance might also have
        // been updated server-side by the cron sync.
        queryClient.setQueryData(stripeConnectStatusKey, status);
        queryClient.invalidateQueries({
          queryKey: queryKeys.wallet.balance(),
        });

        redirectTimer = setTimeout(() => {
          if (!cancelled) router.replace("/wallet");
        }, 2500);
      } catch {
        if (!cancelled) setPhase("error");
      }
    }

    check();
    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [queryClient]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 items-center justify-center px-6">
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={spring.gentle}
          className="w-full max-w-sm items-center"
        >
          {phase === "checking" && (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text variant="h3" className="mt-5 text-center">
                Vérification en cours…
              </Text>
              <Text variant="muted" className="mt-2 text-center">
                Nous vérifions votre compte Stripe.
              </Text>
            </>
          )}

          {phase === "success" && (
            <>
              <MotiView
                from={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={spring.bouncy}
                className="rounded-full bg-success/15 p-4"
              >
                <CheckCircle2
                  size={48}
                  color={colors.success}
                  strokeWidth={1.8}
                />
              </MotiView>
              <Text variant="h3" className="mt-5 text-center">
                {kycStatus === "VERIFIED"
                  ? "Identité vérifiée !"
                  : "Informations enregistrées"}
              </Text>
              <Text variant="muted" className="mt-2 text-center">
                {kycStatus === "VERIFIED"
                  ? "Votre compte est prêt. Vous pouvez demander des virements."
                  : "Votre vérification est en cours. Vous serez notifié dès qu'elle sera terminée."}
              </Text>
              <Text variant="caption" className="mt-6 text-center">
                Redirection vers votre portefeuille…
              </Text>
            </>
          )}

          {phase === "error" && (
            <>
              <View className="rounded-full bg-destructive/15 p-4">
                <AlertTriangle
                  size={48}
                  color={colors.destructive}
                  strokeWidth={1.8}
                />
              </View>
              <Text variant="h3" className="mt-5 text-center">
                Une erreur est survenue
              </Text>
              <Text variant="muted" className="mt-2 text-center">
                Impossible de vérifier le statut de votre compte.
              </Text>
              <Button
                className="mt-6"
                onPress={() => router.replace("/wallet")}
              >
                Retour au portefeuille
              </Button>
            </>
          )}
        </MotiView>
      </View>
    </SafeAreaView>
  );
}
