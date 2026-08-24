import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { MotiView } from "moti";
import { CheckCircle2, MailCheck, TriangleAlert } from "lucide-react-native";

import { Button, FormScrollView, Input, Text } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import { haptics } from "@/lib/haptics";
import {
  fadeInUp,
  motionProps,
  scaleIn,
  useReducedMotionSafe,
} from "@/lib/motion";
import { useThemeColors } from "@/lib/theme-colors";

const REDIRECT_DELAY_MS = 2_000;

export default function EmailConfirmedScreen() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  const isSuccess = status === "success";
  const colors = useThemeColors();
  const reduceMotion = useReducedMotionSafe();
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!isSuccess) {
      haptics.error();
      return;
    }

    haptics.success();
    const timer = setTimeout(() => {
      router.replace("/(tabs)");
    }, REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isSuccess]);

  async function resendConfirmation() {
    if (!email.includes("@")) {
      toast.error("Email requis", "Saisis une adresse email valide.");
      return;
    }

    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: "deckdealr://auth/confirm",
      },
    });
    setResending(false);

    if (error) {
      toast.error(
        "Envoi impossible",
        "Réessaie dans un instant ou contacte le support.",
      );
      return;
    }

    setResent(true);
    haptics.success();
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <FormScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }}>
        <MotiView
          {...motionProps(fadeInUp, { reduceMotion })}
          className="flex-1 items-center justify-center"
        >
          {isSuccess ? (
            <>
              <MotiView
                {...motionProps(scaleIn, { reduceMotion })}
                className="rounded-full bg-success/15 p-5"
              >
                <CheckCircle2
                  size={52}
                  color={colors.success}
                  strokeWidth={1.7}
                />
              </MotiView>
              <Text variant="h2" className="mt-6 text-center">
                Email confirmé, bienvenue !
              </Text>
              <Text variant="muted" className="mt-3 max-w-sm text-center">
                Ton compte TheDeckDealr est maintenant actif. Tu peux commencer
                à découvrir les cartes disponibles.
              </Text>
              <Button
                className="mt-8 w-full max-w-sm"
                onPress={() => router.replace("/(tabs)")}
              >
                Découvrir les cartes
              </Button>
              <Text variant="caption" className="mt-4 text-center">
                Redirection automatique…
              </Text>
            </>
          ) : resent ? (
            <>
              <View className="rounded-full bg-primary/10 p-5">
                <MailCheck size={48} color={colors.primary} strokeWidth={1.7} />
              </View>
              <Text variant="h2" className="mt-6 text-center">
                Nouvel email envoyé
              </Text>
              <Text variant="muted" className="mt-3 max-w-sm text-center">
                Consulte ta boîte mail et clique sur le nouveau lien pour
                finaliser ton inscription.
              </Text>
              <Button
                variant="outline"
                className="mt-8 w-full max-w-sm"
                onPress={() => router.replace("/(auth)/login")}
              >
                Retour à la connexion
              </Button>
            </>
          ) : (
            <>
              <View className="rounded-full bg-destructive/15 p-5">
                <TriangleAlert
                  size={48}
                  color={colors.destructive}
                  strokeWidth={1.7}
                />
              </View>
              <Text variant="h2" className="mt-6 text-center">
                Ce lien n’est plus valide
              </Text>
              <Text variant="muted" className="mt-3 max-w-sm text-center">
                Il a peut-être expiré ou déjà été utilisé. Saisis ton email pour
                recevoir un nouveau lien de confirmation.
              </Text>
              <View className="mt-8 w-full max-w-sm gap-4">
                <Input
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  placeholder="vous@exemple.com"
                />
                <Button onPress={resendConfirmation} loading={resending}>
                  Renvoyer l’email
                </Button>
              </View>
            </>
          )}
        </MotiView>
      </FormScrollView>
    </SafeAreaView>
  );
}
