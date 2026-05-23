import { useState } from "react";
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
import { Button, Input, Label, Text } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";

type FormValues = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const [submitting, setSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

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
