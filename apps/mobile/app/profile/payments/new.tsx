import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, Stack } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react-native";
import {
  initPaymentSheet,
  presentPaymentSheet,
  PaymentSheetError,
} from "@stripe/stripe-react-native";
import { Platform } from "react-native";

import { createSetupIntent } from "@/lib/api/payment-methods";
import { env } from "@/lib/env";
import { Button, Skeleton, Text, toast } from "@/components/ui";
import { MobileHeader } from "@/components/layout/mobile-header";

/**
 * Add a new card. Mobile uses Stripe PaymentSheet in SetupIntent mode (no
 * payment is taken — the card is only saved to the customer for future
 * purchases). On Android the same sheet renders Google Pay; on iOS Apple
 * Pay is intentionally NOT shown here because it doesn't make sense to
 * "save" Apple Pay (it's already saved at the OS level).
 */
export default function NewPaymentMethodScreen() {
  const qc = useQueryClient();
  const [isPreparing, setIsPreparing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      try {
        const { client_secret, customer_id } = await createSetupIntent();
        if (cancelled) return;

        const initResult = await initPaymentSheet({
          merchantDisplayName: "PokeMarket",
          setupIntentClientSecret: client_secret,
          customerId: customer_id,
          appearance: {
            colors: { primary: "#E63946" },
            shapes: { borderRadius: 12 },
          },
          returnURL: "pokemarket://stripe-redirect",
          // On Android, Google Pay needs a country to render the
          // alternative payment method tile in setup mode.
          ...(Platform.OS === "android"
            ? {
                googlePay: {
                  merchantCountryCode: "FR",
                  currencyCode: "EUR",
                  testEnv: !(env.STRIPE_PUBLISHABLE_KEY ?? "").startsWith(
                    "pk_live_",
                  ),
                },
              }
            : {}),
        });

        if (cancelled) return;
        if (initResult.error) {
          setError(initResult.error.message);
        } else {
          setReady(true);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur réseau");
      } finally {
        if (!cancelled) setIsPreparing(false);
      }
    }
    prepare();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAddCard() {
    if (!ready || isSubmitting) return;
    setIsSubmitting(true);
    const result = await presentPaymentSheet();
    setIsSubmitting(false);

    if (result.error) {
      if (result.error.code === PaymentSheetError.Canceled) return;
      toast.error("Échec de l'enregistrement", result.error.message);
      return;
    }

    qc.invalidateQueries({ queryKey: ["paymentMethods", "list"] });
    toast.success("Carte enregistrée !");
    router.back();
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      <MobileHeader
        title="Ajouter une carte"
        fallbackHref="/profile/payments"
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <Text variant="muted">
          Enregistrez un moyen de paiement pour vos prochains achats.
        </Text>

        {isPreparing ? (
          <View className="gap-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </View>
        ) : error ? (
          <View className="items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
            <Text className="text-center text-sm text-destructive">
              {error}
            </Text>
            <Button variant="outline" onPress={() => router.back()}>
              Revenir en arrière
            </Button>
          </View>
        ) : (
          <>
            <View className="rounded-2xl border border-border bg-card p-6">
              <Text className="text-base font-semibold">
                Carte bancaire sécurisée
              </Text>
              <Text variant="muted" className="mt-2">
                Touchez le bouton ci-dessous pour saisir votre carte. Stripe
                ouvre une feuille native (Apple Pay sur iOS / Google Pay sur
                Android).
              </Text>
            </View>

            <View className="flex-row items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <ShieldCheck size={20} color="#E63946" />
              <Text className="flex-1 text-xs leading-5 text-muted-foreground">
                Vos informations sont traitées et stockées par Stripe. Aucune
                donnée bancaire ne transite par nos serveurs.
              </Text>
            </View>

            <Button
              size="lg"
              loading={isSubmitting}
              disabled={!ready}
              onPress={handleAddCard}
            >
              Ajouter ma carte
            </Button>
          </>
        )}
      </ScrollView>
    </View>
  );
}
