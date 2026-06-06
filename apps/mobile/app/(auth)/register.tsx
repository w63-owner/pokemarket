import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Link, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema } from "@pokemarket/shared";
import type { z } from "zod";
import { Button, Input, Label, Text } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";

type FormValues = z.infer<typeof registerSchema>;

export default function RegisterScreen() {
  const [submitting, setSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", username: "" },
  });

  const onSubmit = handleSubmit(async ({ email, password, username }) => {
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: "pokemarket://auth/confirm",
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error("Inscription échouée", error.message);
      return;
    }
    toast.success("Compte créé", "Vérifie tes emails pour confirmer.");
    router.replace("/(auth)/login");
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
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
              <Link href="/(auth)/login" asChild>
                <Pressable hitSlop={4}>
                  <Text className="font-semibold text-primary">
                    Se connecter
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
