import { View } from "react-native";
import { Stack } from "expo-router";
import { getLegalDocument } from "@pokemarket/shared";
import { LegalContent } from "@/components/legal/legal-content";
import { MobileHeader } from "@/components/layout/mobile-header";

export default function MentionsScreen() {
  const document = getLegalDocument("mentions");
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <MobileHeader title="Mentions légales" fallbackHref="/(tabs)/profile" />
      <LegalContent document={document} />
    </View>
  );
}
