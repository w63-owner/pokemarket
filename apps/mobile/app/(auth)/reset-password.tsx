import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { Button, Input, Label, SmartBackButton, Text } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";

type FormValues = { password: string; confirm: string };

export default function ResetPasswordScreen() {
  const [submitting, setSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { password: "", confirm: "" } });

  const onSubmit = handleSubmit(async ({ password, confirm }) => {
    if (password.length < 6) {
      toast.error("Mot de passe trop court", "6 caractères minimum");
      return;
    }
    if (password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error("Échec", error.message);
      return;
    }
    toast.success("Mot de passe modifié");
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
          <View className="mb-4">
            <SmartBackButton fallbackHref="/(auth)/login" />
          </View>

          <View className="flex-1 justify-center gap-6">
            <View className="gap-2">
              <Text variant="h1">Nouveau mot de passe</Text>
              <Text variant="muted">
                Choisis un nouveau mot de passe pour ton compte.
              </Text>
            </View>

            <View className="gap-4">
              <View className="gap-2">
                <Label>Nouveau mot de passe</Label>
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
                      placeholder="••••••••"
                    />
                  )}
                />
              </View>

              <View className="gap-2">
                <Label>Confirmer</Label>
                <Controller
                  control={control}
                  name="confirm"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <Input
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      secureTextEntry
                      autoComplete="new-password"
                      placeholder="••••••••"
                    />
                  )}
                />
              </View>
            </View>

            <Button onPress={onSubmit} loading={submitting}>
              Modifier
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
