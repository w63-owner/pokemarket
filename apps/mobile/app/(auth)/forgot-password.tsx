import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { Button, Input, Label, SmartBackButton, Text } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";

type FormValues = { email: string };

export default function ForgotPasswordScreen() {
  const [submitting, setSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async ({ email }) => {
    if (!email.includes("@")) {
      toast.error("Email requis");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `pokemarket://auth/reset-password`,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Erreur", error.message);
      return;
    }
    toast.success(
      "Email envoyé",
      "Consulte ta boîte mail pour réinitialiser ton mot de passe.",
    );
    router.back();
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
          <View className="mb-4">
            <SmartBackButton fallbackHref="/(auth)/login" />
          </View>

          <View className="flex-1 justify-center gap-6">
            <View className="gap-2">
              <Text variant="h1">Mot de passe oublié</Text>
              <Text variant="muted">
                Entre ton email pour recevoir un lien de réinitialisation.
              </Text>
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
                    placeholder="vous@exemple.com"
                  />
                )}
              />
            </View>

            <Button onPress={onSubmit} loading={submitting}>
              Envoyer le lien
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
