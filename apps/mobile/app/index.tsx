import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { ONBOARDING_DONE_KEY } from "./onboarding";

type Destination = "/onboarding" | "/(tabs)" | "/(auth)/login";

export default function Index() {
  const [destination, setDestination] = useState<Destination | null>(null);

  useEffect(() => {
    let cancelled = false;

    const decide = async () => {
      const [sessionResult, onboardingDone] = await Promise.all([
        supabase.auth.getSession(),
        AsyncStorage.getItem(ONBOARDING_DONE_KEY).catch(() => null),
      ]);

      if (cancelled) return;

      const authed = !!sessionResult.data.session;
      // Show onboarding only when neither logged in nor previously seen.
      // Authenticated users skip onboarding even if the flag is missing
      // (e.g. fresh install but biometric login restored a session).
      if (!authed && onboardingDone !== "1") {
        setDestination("/onboarding");
      } else if (authed) {
        setDestination("/(tabs)");
      } else {
        setDestination("/(auth)/login");
      }
    };

    decide();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) setDestination("/(tabs)");
      },
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (!destination) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#E63946" />
        <Text className="mt-3 text-muted-foreground">Chargement...</Text>
      </View>
    );
  }

  return <Redirect href={destination} />;
}
