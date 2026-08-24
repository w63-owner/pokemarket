import { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema } from "@deckdealr/shared";
import type { z } from "zod";
import { MailCheck } from "lucide-react-native";
import {
  Button,
  FormScrollView,
  Input,
  Label,
  SmartBackButton,
  Text,
} from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import { useThemeColors } from "@/lib/theme-colors";

type FormValues = z.infer<typeof registerSchema>;

export default function RegisterScreen() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [checkingConfirmation, setCheckingConfirmation] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(
    null,
  );
  const colors = useThemeColors();
  const {
    control,
    getValues,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", username: "" },
  });

  const returnToLogin = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(auth)/login");
    }
  };

  const onSubmit = handleSubmit(async ({ email, password, username }) => {
    setSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: "deckdealr://auth/confirm",
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error("Inscription échouée", error.message);
      return;
    }
    if (data.session) {
      router.replace("/(tabs)");
      return;
    }
    setConfirmationEmail(email);
  });

  async function checkConfirmation() {
    const { email, password } = getValues();
    setCheckingConfirmation(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setCheckingConfirmation(false);

    if (error) {
      toast.error(
        "Confirmation en attente",
        "Clique d’abord sur le lien reçu dans ta boîte mail.",
      );
      return;
    }

    router.replace("/(tabs)");
  }

  if (confirmationEmail) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-full max-w-sm items-center">
            <View className="rounded-full bg-primary/10 p-5">
              <MailCheck size={48} color={colors.primary} strokeWidth={1.8} />
            </View>
            <Text variant="h2" className="mt-6 text-center">
              Consulte ta boîte mail
            </Text>
            <Text className="mt-3 text-center">
              Nous avons envoyé un email à{" "}
              <Text className="font-semibold">{confirmationEmail}</Text>.
            </Text>
            <Text variant="muted" className="mt-3 text-center">
              Clique sur le lien reçu pour confirmer ton adresse et finaliser
              ton inscription. Pense à vérifier tes courriers indésirables.
            </Text>
            <Button
              className="mt-8 w-full"
              onPress={checkConfirmation}
              loading={checkingConfirmation}
            >
              J&apos;ai confirmé mon email
            </Button>
            <Button
              variant="ghost"
              className="mt-2 w-full"
              onPress={returnToLogin}
            >
              Retour à la connexion
            </Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <FormScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }}>
        <View className="mb-4">
          <SmartBackButton fallbackHref="/(auth)/login" />
        </View>

        <View className="flex-1 justify-center gap-6">
          <View className="gap-2">
            <Text variant="h1">Créer un compte</Text>
            <Text variant="muted">
              Rejoins la marketplace des collectionneurs Pokémon.
            </Text>
          </View>

          <View className="gap-4">
            <View className="gap-2">
              <Label>Pseudo</Label>
              <Controller
                control={control}
                name="username"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="pikachu_master"
                    error={!!errors.username}
                  />
                )}
              />
              {errors.username ? (
                <Text variant="caption" className="text-destructive">
                  {errors.username.message}
                </Text>
              ) : null}
            </View>

            <View className="gap-2">
              <Label>Email</Label>
              <Controller
                control={control}
                name="email"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                    placeholder="vous@exemple.com"
                    error={!!errors.email}
                  />
                )}
              />
              {errors.email ? (
                <Text variant="caption" className="text-destructive">
                  {errors.email.message}
                </Text>
              ) : null}
            </View>

            <View className="gap-2">
              <Label>Mot de passe</Label>
              <Controller
                control={control}
                name="password"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                    placeholder="••••••••"
                    error={!!errors.password}
                  />
                )}
              />
              {errors.password ? (
                <Text variant="caption" className="text-destructive">
                  {errors.password.message}
                </Text>
              ) : null}
            </View>
          </View>

          <Button onPress={onSubmit} loading={submitting}>
            Créer mon compte
          </Button>

          <View className="flex-row items-center justify-center gap-1">
            <Text variant="muted">Déjà inscrit ?</Text>
            <Pressable onPress={returnToLogin} hitSlop={4}>
              <Text className="font-semibold text-primary">Se connecter</Text>
            </Pressable>
          </View>
        </View>
      </FormScrollView>
    </SafeAreaView>
  );
}
