import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { getLegalDocument } from "@pokemarket/shared";
import { LegalContent } from "@/components/legal/legal-content";
import { SmartBackButton, Text } from "@/components/ui";

export default function PrivacyScreen() {
  const document = getLegalDocument("privacy");
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center gap-3 border-b border-border bg-card px-2 py-3">
        <SmartBackButton fallbackHref="/(tabs)/profile" />
        <Text className="text-base font-semibold">Confidentialité</Text>
      </View>
      <LegalContent document={document} />
    </SafeAreaView>
  );
}
