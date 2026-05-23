import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Link, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema } from "@pokemarket/shared";
import type { z } from "zod";
import { Fingerprint } from "lucide-react-native";
import { Button, Input, Label, Text } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import {
  getBiometryCapability,
  isBiometryEnabled,
  unlockWithBiometry,
} from "@/lib/biometry";
import { useThemeColor } from "@/lib/theme-colors";

type FormValues = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const [submitting, setSubmitting] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biométrie");
  const [biometricBusy, setBiometricBusy] = useState(false);
  const foreground = useThemeColor("foreground");
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([isBiometryEnabled(), getBiometryCapability()]).then(
      ([enabled, capability]) => {
        if (cancelled) return;
        setBiometricLabel(capability.label);
        setBiometricAvailable(
          enabled && capability.hasHardware && capability.isEnrolled,
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBiometricUnlock = async () => {
    setBiometricBusy(true);
    const result = await unlockWithBiometry();
    setBiometricBusy(false);
    if (result.ok) {
      router.replace("/(tabs)");
      return;
    }
    if (result.reason === "biometry-failed") {
      // User cancelled the system prompt — silent.
      return;
    }
    if (result.reason === "refresh-failed") {
      toast.error("Reconnexion requise", result.message);
      setBiometricAvailable(false);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword(values);
    setSubmitting(false);
    if (error) {
      toast.error("Connexion échouée", error.message);
      return;
    }
    router.replace("/(tabs)");
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 justify-center gap-6">
            <View className="gap-2">
              <Text variant="h1">Bon retour</Text>
              <Text variant="muted">Connecte-toi à ton compte PokeMarket.</Text>
            </View>

            <View className="gap-4">
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
                <View className="flex-row items-center justify-between">
                  <Label>Mot de passe</Label>
                  <Link href="/(auth)/forgot-password" asChild>
                    <Pressable hitSlop={8}>
                      <Text className="text-sm text-primary">Oublié ?</Text>
                    </Pressable>
                  </Link>
                </View>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <Input
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      secureTextEntry
                      autoCapitalize="none"
                      autoComplete="current-password"
                      textContentType="password"
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
              Se connecter
            </Button>

            {biometricAvailable ? (
              <Pressable
                onPress={handleBiometricUnlock}
                disabled={biometricBusy}
                className="flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 active:opacity-80"
              >
                <Fingerprint size={18} color={foreground} />
                <Text className="font-semibold">
                  Se connecter avec {biometricLabel}
                </Text>
              </Pressable>
            ) : null}

            <View className="flex-row items-center justify-center gap-1">
              <Text variant="muted">Pas encore de compte ?</Text>
              <Link href="/(auth)/register" asChild>
                <Pressable hitSlop={4}>
                  <Text className="font-semibold text-primary">
                    S&apos;inscrire
                  </Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
